import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { authRouter } from '../src/routes/auth.routes.js';
import { substationsRouter } from '../src/routes/substations.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import prisma from '../src/config/prisma.js';
import { resolveEquipmentConstructionCode } from '../src/config/constructionTemplates.js';

/** 설비 자재코드 → 시공 템플릿 키 해소(순수 함수, DB 불필요). */
describe('resolveEquipmentConstructionCode (템플릿 키 해소)', () => {
  it('접두사 없는 타입코드 → EQP- 접두사 템플릿 키', () => {
    expect(resolveEquipmentConstructionCode('RACK')).toBe('EQP-RACK');
    expect(resolveEquipmentConstructionCode('OFD')).toBe('EQP-OFD');
    expect(resolveEquipmentConstructionCode('RTU')).toBe('EQP-RTU');
  });
  it('이미 템플릿 키면 그대로', () => {
    expect(resolveEquipmentConstructionCode('EQP-RTU')).toBe('EQP-RTU');
  });
  it('매핑 없는 타입은 그대로(diff-only 유지) — EQP-DIST 템플릿 없음', () => {
    expect(resolveEquipmentConstructionCode('DIST')).toBe('DIST');
  });
  it('null/undefined → null', () => {
    expect(resolveEquipmentConstructionCode(null)).toBeNull();
    expect(resolveEquipmentConstructionCode(undefined)).toBeNull();
  });
});

/**
 * #3 Task 1 — POST /api/substations/:id/report-preview 오버레이 dry-run 설계서.
 *
 * 활성 층 staged 변경(before/after PlanSnapshot)을 보내 calculateConstructionReport
 * 엔진 산출(diff/BOM/노무)을 받는다. 핵심:
 *  - 설비 신규 1 + 케이블 신규(길이 L) → diff 2건(install), BOM 자재·수량, 노무 시간.
 *  - dry-run: 호출 전후 asset/cable row count 동일(DB 미변경).
 *  - floor 소유권 검증 + 인증 게이팅.
 */
describe('오버레이 설계서 프리뷰 (POST /substations/:id/report-preview)', () => {
  let app: Express;
  let token: string;
  let userId: string;
  let hqId: string, brId: string, subId: string, floorId: string;
  let rackAssetTypeId: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    app.use('/api/substations', substationsRouter);
    app.use(errorHandler);

    const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    token = login.body.accessToken;
    userId = (await prisma.user.findFirstOrThrow({ where: { username: 'admin' } })).id;

    const hq = await prisma.headquarters.create({ data: { name: '__rp_hq__' } }); hqId = hq.id;
    const br = await prisma.branch.create({ data: { name: '__rp_br__', headquartersId: hq.id } }); brId = br.id;
    const sub = await prisma.substation.create({ data: { name: '__rp_sub__', branchId: br.id } }); subId = sub.id;
    const floor = await prisma.floor.create({ data: { substationId: subId, name: '__rp_floor__', createdById: userId, updatedById: userId } });
    floorId = floor.id;

    // 시드된 RACK AssetType id (staged-create 설비의 assetTypeId 해소 검증용).
    rackAssetTypeId = (await prisma.assetType.findFirstOrThrow({ where: { code: 'RACK' } })).id;
  });

  afterAll(async () => {
    await prisma.floor.delete({ where: { id: floorId } }).catch(() => {});
    await prisma.substation.delete({ where: { id: subId } }).catch(() => {});
    await prisma.branch.delete({ where: { id: brId } }).catch(() => {});
    await prisma.headquarters.delete({ where: { id: hqId } }).catch(() => {});
    await prisma.$disconnect();
  });

  /**
   * 설비 신규 1 + 케이블 신규(CBL-UTP, 길이 L) — before 비어 있음.
   * 설비 자재코드는 프론트가 보내는 **접두사 없는** assetType.code('RACK')로 둔다.
   * 백엔드가 'RACK' → 'EQP-RACK' 로 해소해 BOM/노무가 산출되어야 한다(회귀 가드).
   */
  const L = 10;
  const changes = {
    before: { equipment: [], cables: [] },
    after: {
      equipment: [
        { id: 'eq1', name: '신규 랙', materialCategoryCode: 'RACK' },
      ],
      cables: [
        {
          id: 'cb1',
          cableType: 'LAN',
          materialCategoryCode: 'CBL-UTP',
          totalLength: L,
          sourceEquipmentId: 'eq1',
          targetEquipmentId: 'eq1',
        },
      ],
    },
  };

  it('200 — diff 2건(install) + BOM 자재·수량 + 노무 시간', async () => {
    const res = await request(app)
      .post(`/api/substations/${subId}/report-preview`)
      .set('Authorization', `Bearer ${token}`)
      .send({ floorId, changes })
      .expect(200);

    const report = res.body.data;

    // diff: 설비 install + 케이블 install = 2건
    expect(report.diff).toHaveLength(2);
    const eqDiff = report.diff.find((d: any) => d.type === 'equipment');
    const cbDiff = report.diff.find((d: any) => d.type === 'cable');
    expect(eqDiff.action).toBe('install');
    // 'RACK' 입력이 시공 템플릿 키 'EQP-RACK' 로 해소됨.
    expect(eqDiff.materialCategoryCode).toBe('EQP-RACK');
    expect(cbDiff.action).toBe('install');
    expect(cbDiff.materialCategoryCode).toBe('CBL-UTP');
    expect(cbDiff.length).toBe(L);

    // BOM: EQP-RACK + CBL-UTP 본자재 + 부속자재(라벨/타이 등) 포함, 수량 > 0
    const rackBom = report.bom.find((b: any) => b.materialCategoryCode === 'EQP-RACK');
    expect(rackBom.quantity).toBe(1);
    const utpBom = report.bom.find((b: any) => b.materialCategoryCode === 'CBL-UTP');
    expect(utpBom.quantity).toBe(L);
    // CBL-UTP install 부속: 케이블타이 quantityPerMeter 0.5 → 0.5 * 10 = 5
    const tie = report.bom.find((b: any) => b.materialCategoryCode === 'ACC-MISC-TIE');
    expect(tie.quantity).toBeCloseTo(0.5 * L, 5);

    // 노무: EQP-RACK install 2.0h + CBL-UTP 0.02 * 10 = 0.2h → 총 2.2h
    expect(report.totalLaborHours).toBeCloseTo(2.2, 5);
    expect(report.labor.length).toBeGreaterThanOrEqual(2);
  });

  it('staged-create 설비(자재코드 null + assetTypeId) → assetTypeId 로 EQP-RACK 해소 → BOM/노무 산출', async () => {
    // staged-create 설비는 assetType 이 placeholder 라 materialCategoryCode 가 null 이지만
    // assetTypeId(시드된 RACK)는 있다. 백엔드가 assetTypeId → AssetType.code('RACK') →
    // 'EQP-RACK' 로 해소해 BOM/노무가 나와야 한다(이 픽스의 핵심 회귀 가드).
    const stagedChanges = {
      before: { equipment: [], cables: [] },
      after: {
        equipment: [
          { id: 'eq-staged', name: '신규 랙(staged)', materialCategoryCode: null, assetTypeId: rackAssetTypeId },
        ],
        cables: [],
      },
    };

    const res = await request(app)
      .post(`/api/substations/${subId}/report-preview`)
      .set('Authorization', `Bearer ${token}`)
      .send({ floorId, changes: stagedChanges })
      .expect(200);

    const report = res.body.data;
    const eqDiff = report.diff.find((d: any) => d.type === 'equipment');
    expect(eqDiff.action).toBe('install');
    expect(eqDiff.materialCategoryCode).toBe('EQP-RACK');

    const rackBom = report.bom.find((b: any) => b.materialCategoryCode === 'EQP-RACK');
    expect(rackBom).toBeDefined();
    expect(rackBom.quantity).toBe(1);
    // null-code 였어도 노무가 산출됨(EQP-RACK install).
    expect(report.totalLaborHours).toBeGreaterThan(0);
    expect(report.labor.length).toBeGreaterThanOrEqual(1);
  });

  it('dry-run — 호출 전후 이 변전소 asset/cable row count 동일(DB 미변경)', async () => {
    // 전역 count 는 병렬 테스트가 만지므로 이 테스트 소유 변전소로 스코핑.
    const countScoped = async () => ({
      assets: await prisma.asset.count({ where: { substationId: subId } }),
      cables: await prisma.cable.count({
        where: {
          OR: [
            { sourceEquipment: { substationId: subId } },
            { targetEquipment: { substationId: subId } },
          ],
        },
      }),
    });

    const before = await countScoped();

    await request(app)
      .post(`/api/substations/${subId}/report-preview`)
      .set('Authorization', `Bearer ${token}`)
      .send({ floorId, changes })
      .expect(200);

    const after = await countScoped();
    expect(after).toEqual(before);
    // changes 의 payload id(eq1/cb1)는 절대 영속되지 않음 — 0행 유지.
    expect(after).toEqual({ assets: 0, cables: 0 });
  });

  it('404 — floor 가 해당 변전소 소유가 아니면', async () => {
    // 임의 uuid (존재하지 않는 floor)
    await request(app)
      .post(`/api/substations/${subId}/report-preview`)
      .set('Authorization', `Bearer ${token}`)
      .send({ floorId: '00000000-0000-0000-0000-000000000000', changes })
      .expect(404);
  });

  it('인증 없음 → 401', async () => {
    await request(app)
      .post(`/api/substations/${subId}/report-preview`)
      .send({ floorId, changes })
      .expect(401);
  });
});
