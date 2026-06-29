import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { authRouter } from '../src/routes/auth.routes.js';
import { traceRouter } from '../src/routes/trace.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import prisma from '../src/config/prisma.js';

/**
 * POST /api/trace 통합 테스트.
 *
 * 테스트 전략:
 * 1) committed 케이블 체인에서 정상 트레이스 → nodeIds/cableIds 검증.
 * 2) overlay.cables.creates (what-if 케이블 추가) → 확장된 경로 반영 검증.
 * 3) overlay.cables.deletes (what-if 케이블 제거) → 격리 검증.
 * 4) 비인증 요청 → 401.
 */
describe('POST /api/trace — 서버 트레이스 통합', () => {
  let app: Express;
  let token: string;
  let userId: string;

  // 테스트 전용 조직 트리 id
  let hqId: string, brId: string, subId: string;
  // 자산 역할 id
  let deviceTypeId: string;
  // 케이블 그룹/카테고리
  let groupId: string, catId: string;
  // 자산 A–C + committed 케이블 A–B
  let assetAId: string, assetBId: string, assetCId: string;
  let cableABId: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    app.use('/api/trace', traceRouter);
    app.use(errorHandler);

    // 로그인
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    token = login.body.accessToken;
    userId = (await prisma.user.findFirstOrThrow({ where: { username: 'admin' } })).id;

    // 조직 트리
    const hq = await prisma.headquarters.create({ data: { name: '__tr_hq__' } });
    hqId = hq.id;
    const br = await prisma.branch.create({ data: { name: '__tr_br__', headquartersId: hqId } });
    brId = br.id;
    const sub = await prisma.substation.create({ data: { name: '__tr_sub__', branchId: brId } });
    subId = sub.id;

    // AssetType (device 역할) — 기존 시드에서 찾는다
    deviceTypeId = (await prisma.assetType.findFirstOrThrow({ where: { role: 'device' } })).id;

    // 케이블 그룹 + 카테고리
    const grp = await prisma.cableGroup.create({ data: { name: '__tr_group__', color: '#000' } });
    groupId = grp.id;
    const cat = await prisma.cableCategory.create({
      data: { name: '__tr_cat__', groupId },
    });
    catId = cat.id;

    // 자산 A, B, C
    const [a, b, c] = await Promise.all([
      prisma.asset.create({ data: { substationId: subId, assetTypeId: deviceTypeId, name: '__tr_A__' } }),
      prisma.asset.create({ data: { substationId: subId, assetTypeId: deviceTypeId, name: '__tr_B__' } }),
      prisma.asset.create({ data: { substationId: subId, assetTypeId: deviceTypeId, name: '__tr_C__' } }),
    ]);
    assetAId = a.id;
    assetBId = b.id;
    assetCId = c.id;

    // committed 케이블: A ─── B (카테고리 = __tr_cat__)
    const cable = await prisma.cable.create({
      data: {
        sourceAssetId: assetAId,
        targetAssetId: assetBId,
        categoryId: catId,
      },
    });
    cableABId = cable.id;
  });

  afterAll(async () => {
    await prisma.cable.deleteMany({
      where: {
        OR: [
          { sourceAsset: { substationId: subId } },
          { targetAsset: { substationId: subId } },
        ],
      },
    }).catch(() => {});
    await prisma.asset.deleteMany({ where: { substationId: subId } }).catch(() => {});
    await prisma.substation.delete({ where: { id: subId } }).catch(() => {});
    await prisma.cableCategory.delete({ where: { id: catId } }).catch(() => {});
    await prisma.cableGroup.delete({ where: { id: groupId } }).catch(() => {});
    await prisma.branch.delete({ where: { id: brId } }).catch(() => {});
    await prisma.headquarters.delete({ where: { id: hqId } }).catch(() => {});
    await prisma.$disconnect();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 1) 기본 트레이스: committed 케이블 A-B
  // ────────────────────────────────────────────────────────────────────────────
  it('1) committed 케이블(A─B)에서 A 시작 → nodeIds=[A,B], cableIds=[A─B]', async () => {
    const res = await request(app)
      .post('/api/trace')
      .set('Authorization', `Bearer ${token}`)
      .send({ seedAssetId: assetAId, groupId });

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(new Set(data.nodeIds)).toEqual(new Set([assetAId, assetBId]));
    expect(new Set(data.cableIds)).toEqual(new Set([cableABId]));
    expect(data.nodes.length).toBe(2);
    expect(data.cables.length).toBe(1);
    expect(data.truncated).toBe(false);

    // TraceNode 필드 검증
    const nodeA = data.nodes.find((n: { id: string }) => n.id === assetAId);
    expect(nodeA).toBeDefined();
    expect(nodeA.substationId).toBe(subId);
    expect(typeof nodeA.substationName).toBe('string');
    // device 역할(assetType.role) 이 반영되어야 한다
    expect(nodeA.role).toBe('device');
    // slotIndex 필드가 응답에 포함되어야 한다(슬롯 아닌 자산은 null) — 선번장 순번 보존용.
    expect(nodeA).toHaveProperty('slotIndex');
    expect(nodeA.slotIndex).toBeNull();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 2) overlay what-if: staged 케이블 B─C 추가 → C 까지 도달
  // ────────────────────────────────────────────────────────────────────────────
  it('2) overlay.creates B─C → nodeIds=[A,B,C] (what-if 반영)', async () => {
    const res = await request(app)
      .post('/api/trace')
      .set('Authorization', `Bearer ${token}`)
      .send({
        seedAssetId: assetAId,
        groupId,
        overlay: {
          cables: {
            creates: [
              {
                tempId: 'staged-BC',
                sourceAssetId: assetBId,
                targetAssetId: assetCId,
                categoryId: catId,
              },
            ],
          },
          assets: [],
        },
      });

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(new Set(data.nodeIds)).toEqual(new Set([assetAId, assetBId, assetCId]));
    // committed A-B + staged B-C (tempId 식별자)
    expect(data.cableIds).toContain(cableABId);
    expect(data.cableIds).toContain('staged-BC');
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 3) overlay what-if: 케이블 A─B 삭제 → A 혼자만 남음
  // ────────────────────────────────────────────────────────────────────────────
  it('3) overlay.deletes A─B → nodeIds=[A] (케이블 제거 what-if)', async () => {
    const res = await request(app)
      .post('/api/trace')
      .set('Authorization', `Bearer ${token}`)
      .send({
        seedAssetId: assetAId,
        groupId,
        overlay: {
          cables: {
            deletes: [{ id: cableABId, baseVersion: null }],
          },
          assets: [],
        },
      });

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.nodeIds).toEqual([assetAId]);
    expect(data.cableIds).toHaveLength(0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 4) overlay.updates: sourceRole null 명시 → null 로 반영 (null-clear fix)
  // ────────────────────────────────────────────────────────────────────────────
  it('4) overlay.updates A─B sourceRole=null → 케이블 sourceRole null로 클리어', async () => {
    const res = await request(app)
      .post('/api/trace')
      .set('Authorization', `Bearer ${token}`)
      .send({
        seedAssetId: assetAId,
        groupId,
        overlay: {
          cables: {
            updates: [
              { id: cableABId, baseVersion: null, patch: { sourceRole: null } },
            ],
          },
          assets: [],
        },
      });

    expect(res.status).toBe(200);
    const data = res.body.data;
    const cable = data.cables.find((c: { id: string }) => c.id === cableABId);
    expect(cable).toBeDefined();
    expect(cable.sourceRole).toBeNull();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 5) overlay.cables 생략(asset-only overlay) → 422 아닌 200
  // ────────────────────────────────────────────────────────────────────────────
  it('5) overlay.cables 생략(asset-only) → 200 정상 트레이스', async () => {
    const res = await request(app)
      .post('/api/trace')
      .set('Authorization', `Bearer ${token}`)
      .send({
        seedAssetId: assetAId,
        groupId,
        overlay: { assets: [] },
      });

    expect(res.status).toBe(200);
    expect(new Set(res.body.data.nodeIds)).toEqual(new Set([assetAId, assetBId]));
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 6) 비인증 → 401
  // ────────────────────────────────────────────────────────────────────────────
  it('6) 비인증 요청 → 401', async () => {
    const res = await request(app)
      .post('/api/trace')
      .send({ seedAssetId: assetAId, groupId });

    expect(res.status).toBe(401);
  });
});
