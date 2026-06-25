import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { authRouter } from '../src/routes/auth.routes.js';
import { substationsRouter } from '../src/routes/substations.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import prisma from '../src/config/prisma.js';

/**
 * #3 Task 1 / Task 4 — POST /api/substations/:id/report-preview オーバーレイ dry-run 설계서.
 *
 * Task 4 변경: 스냅샷이 categoryId/name 기반으로 바뀌었고 BOM 은 key 로 집계.
 * resolveEquipmentConstructionCode(삭제됨) 테스트 제거.
 */
describe('오버레이 설계서 프리뷰 (POST /substations/:id/report-preview)', () => {
  let app: Express;
  let token: string;
  let userId: string;
  let hqId: string, brId: string, subId: string, floorId: string;
  let rackAssetTypeId: string;
  let fiberCategoryId: string;

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

    // RACK AssetType id (설비 assetTypeId 검증용)
    rackAssetTypeId = (await prisma.assetType.findFirstOrThrow({ where: { name: '랙' } })).id;

    // 광케이블 카테고리 (광 그룹 소속) id
    const fiberGroup = await prisma.cableGroup.findFirst({ where: { name: '광' } });
    const fiberCat = fiberGroup
      ? await prisma.cableCategory.findFirst({ where: { groupId: fiberGroup.id } })
      : null;
    fiberCategoryId = fiberCat?.id ?? '';
  });

  afterAll(async () => {
    await prisma.floor.delete({ where: { id: floorId } }).catch(() => {});
    await prisma.substation.delete({ where: { id: subId } }).catch(() => {});
    await prisma.branch.delete({ where: { id: brId } }).catch(() => {});
    await prisma.headquarters.delete({ where: { id: hqId } }).catch(() => {});
    await prisma.$disconnect();
  });

  /**
   * 설비 신규(assetTypeId=RACK) + 케이블 신규(categoryId=광, 길이 L).
   * 새 스냅샷 모양: cables에 categoryId+name, equipment에 assetTypeId+name.
   */
  const L = 10; // m. totalLength 는 cm이므로 L*100.

  const buildChanges = (catId: string) => ({
    before: { equipment: [], cables: [] },
    after: {
      equipment: [
        { id: 'eq1', name: '신규 랙', assetTypeId: rackAssetTypeId ?? undefined },
      ],
      cables: catId
        ? [
            {
              id: 'cb1',
              categoryId: catId,
              name: '광케이블',
              totalLength: L * 100,
              sourceAssetId: 'eq1',
              targetAssetId: 'eq1',
            },
          ]
        : [],
    },
  });

  it('200 — diff 2건(install) + BOM 자재·수량 + 노무 시간', async () => {
    const changes = buildChanges(fiberCategoryId);
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
    expect(eqDiff.assetTypeId).toBe(rackAssetTypeId);
    expect(cbDiff.action).toBe('install');
    expect(cbDiff.length).toBe(L);

    // BOM: key 기반 집계 — 케이블 자재(m), 설비 자재(대)
    const cableBom = report.bom.find((b: any) => b.unit === 'm');
    expect(cableBom).toBeDefined();
    expect(cableBom.quantity).toBe(L);

    const equipBom = report.bom.find((b: any) => b.unit === '대');
    expect(equipBom).toBeDefined();
    expect(equipBom.quantity).toBe(1);

    // 부속자재 없음
    expect(report.bom.every((b: any) => !('isAccessory' in b) || b.isAccessory === false)).toBe(true);

    // 노무: RACK install(있으면) + 광케이블 install
    expect(report.totalLaborHours).toBeGreaterThan(0);
    expect(report.labor.length).toBeGreaterThanOrEqual(1);
  });

  it('설비만(assetTypeId) → diff 1건(install) + BOM 설비', async () => {
    const changes = {
      before: { equipment: [], cables: [] },
      after: {
        equipment: [{ id: 'eq-rack', name: '랙', assetTypeId: rackAssetTypeId }],
        cables: [],
      },
    };

    const res = await request(app)
      .post(`/api/substations/${subId}/report-preview`)
      .set('Authorization', `Bearer ${token}`)
      .send({ floorId, changes })
      .expect(200);

    const report = res.body.data;
    expect(report.diff).toHaveLength(1);
    expect(report.diff[0].action).toBe('install');
    expect(report.diff[0].assetTypeId).toBe(rackAssetTypeId);

    const equipBom = report.bom.find((b: any) => b.unit === '대');
    expect(equipBom).toBeDefined();
  });

  it('dry-run — 호출 전후 이 변전소 asset/cable row count 동일(DB 미변경)', async () => {
    const countScoped = async () => ({
      assets: await prisma.asset.count({ where: { substationId: subId } }),
      cables: await prisma.cable.count({
        where: {
          OR: [
            { sourceAsset: { substationId: subId } },
            { targetAsset: { substationId: subId } },
          ],
        },
      }),
    });

    const before = await countScoped();
    const changes = buildChanges(fiberCategoryId);

    await request(app)
      .post(`/api/substations/${subId}/report-preview`)
      .set('Authorization', `Bearer ${token}`)
      .send({ floorId, changes })
      .expect(200);

    const after = await countScoped();
    expect(after).toEqual(before);
    expect(after).toEqual({ assets: 0, cables: 0 });
  });

  it('404 — floor 가 해당 변전소 소유가 아니면', async () => {
    const changes = buildChanges(fiberCategoryId);
    await request(app)
      .post(`/api/substations/${subId}/report-preview`)
      .set('Authorization', `Bearer ${token}`)
      .send({ floorId: '00000000-0000-0000-0000-000000000000', changes })
      .expect(404);
  });

  it('인증 없음 → 401', async () => {
    const changes = buildChanges(fiberCategoryId);
    await request(app)
      .post(`/api/substations/${subId}/report-preview`)
      .send({ floorId, changes })
      .expect(401);
  });
});
