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
 * 1) committed 케이블 체인에서 seedCableId 시드 → nodeIds/cableIds 검증.
 * 2) overlay.cables.creates (what-if 케이블 추가) → 확장된 경로 반영 검증.
 * 3) overlay.cables.deletes (what-if 케이블 제거) → 격리 검증.
 * 4) 비인증 요청 → 401.
 * 5) fiber strand 시나리오: slot--patch#K-->devA, OPGW S1-S2, S2--q#K-->devB.
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
  // 1) 기본 트레이스: committed 케이블 A-B, seedCableId=cableABId
  // ────────────────────────────────────────────────────────────────────────────
  it('1) committed 케이블(A─B)을 시드로 → nodeIds=[A,B], cableIds=[A─B]', async () => {
    const res = await request(app)
      .post('/api/trace')
      .set('Authorization', `Bearer ${token}`)
      .send({ seedCableId: cableABId });

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
  // 2) overlay what-if: committed 케이블 A-B 시드 + staged 케이블 B─C 추가 → C 까지 도달
  // ────────────────────────────────────────────────────────────────────────────
  it('2) overlay.creates B─C → nodeIds=[A,B,C] (what-if 반영)', async () => {
    const res = await request(app)
      .post('/api/trace')
      .set('Authorization', `Bearer ${token}`)
      .send({
        seedCableId: cableABId,
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
  // 3) overlay what-if: 시드 케이블 A─B 삭제 → 시드가 사라지므로 빈 결과
  // ────────────────────────────────────────────────────────────────────────────
  it('3) overlay.deletes A─B (시드 케이블 삭제) → 빈 결과', async () => {
    const res = await request(app)
      .post('/api/trace')
      .set('Authorization', `Bearer ${token}`)
      .send({
        seedCableId: cableABId,
        overlay: {
          cables: {
            deletes: [{ id: cableABId, baseVersion: null }],
          },
          assets: [],
        },
      });

    expect(res.status).toBe(200);
    const data = res.body.data;
    // 시드 케이블이 삭제되면 mergedCables 에서 찾을 수 없으므로 빈 결과
    expect(data.nodeIds).toHaveLength(0);
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
        seedCableId: cableABId,
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
        seedCableId: cableABId,
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
      .send({ seedCableId: cableABId });

    expect(res.status).toBe(401);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 7) 슬롯 노드의 부모 OFD 가 응답 nodes 에 포함된다 — 토폴로지가 슬롯을 부모 OFD 로
  //    collapse 해 렌더하므로, OFD 의 name/substation 이 component 에 있어야 id(UUID)로
  //    안 떨어지고 변전소 그룹에 붙는다(전역 피드 제거 후 component 렌더-자족성).
  // ────────────────────────────────────────────────────────────────────────────
  it('7) 슬롯 노드의 부모 OFD 가 nodes 에 name/substation 과 함께 포함(nodeIds 엔 없음)', async () => {
    const ofdTypeId = (await prisma.assetType.findFirstOrThrow({ where: { role: 'ofd' } })).id;
    const slotTypeId = (await prisma.assetType.findFirstOrThrow({ where: { role: 'slot' } })).id;
    const ofd = await prisma.asset.create({ data: { substationId: subId, assetTypeId: ofdTypeId, name: '__tr_OFD__' } });
    const slot = await prisma.asset.create({ data: { substationId: subId, assetTypeId: slotTypeId, name: '__tr_SLOT__', parentAssetId: ofd.id } });
    const dev = await prisma.asset.create({ data: { substationId: subId, assetTypeId: deviceTypeId, name: '__tr_DEV2__' } });
    const slotDevCable = await prisma.cable.create({ data: { sourceAssetId: slot.id, targetAssetId: dev.id, categoryId: catId } });

    const res = await request(app)
      .post('/api/trace')
      .set('Authorization', `Bearer ${token}`)
      .send({ seedCableId: slotDevCable.id });

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.nodeIds).toContain(slot.id);      // 슬롯은 트레이스 노드
    expect(data.nodeIds).not.toContain(ofd.id);   // 부모 OFD 는 트레이스 노드 아님
    const ofdNode = data.nodes.find((n: { id: string }) => n.id === ofd.id);
    expect(ofdNode).toBeDefined();                // 그러나 렌더용으로 nodes 에 포함
    expect(ofdNode.name).toBe('__tr_OFD__');
    expect(ofdNode.substationName).toBe('__tr_sub__');
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 8) fiber strand 시나리오: slot1--patch#K(OUT)-->devA, OPGW slot1-slot2, slot2--q#K(OUT)-->devB
  //    patch#K 를 시드 → devA, devB 모두 포함
  // ────────────────────────────────────────────────────────────────────────────
  it('8) fiber strand: seedCableId=patch#K → 대국 설비(devB) 포함', async () => {
    const ofdTypeId = (await prisma.assetType.findFirstOrThrow({ where: { role: 'ofd' } })).id;
    const slotTypeId = (await prisma.assetType.findFirstOrThrow({ where: { role: 'slot' } })).id;

    // OFD A side: ofdA → slot1
    const ofdA = await prisma.asset.create({ data: { substationId: subId, assetTypeId: ofdTypeId, name: '__tr_OFDA__' } });
    const slot1 = await prisma.asset.create({ data: { substationId: subId, assetTypeId: slotTypeId, name: '__tr_S1__', parentAssetId: ofdA.id } });
    // OFD B side: ofdB → slot2
    const ofdB = await prisma.asset.create({ data: { substationId: subId, assetTypeId: ofdTypeId, name: '__tr_OFDB__' } });
    const slot2 = await prisma.asset.create({ data: { substationId: subId, assetTypeId: slotTypeId, name: '__tr_S2__', parentAssetId: ofdB.id } });
    // 단말 설비
    const devA = await prisma.asset.create({ data: { substationId: subId, assetTypeId: deviceTypeId, name: '__tr_devA__' } });
    const devB = await prisma.asset.create({ data: { substationId: subId, assetTypeId: deviceTypeId, name: '__tr_devB__' } });

    // 케이블 구성 (core number = 5):
    //
    // cableTrace slot 규칙 (cableTrace.ts 주석):
    //   entryRole=OUT → exits where roleAt(c,slot)==IN, nextCh=via.number
    //   entryRole=IN  → exits where roleAt(c,slot)==OUT && c.number===ch
    //
    // 원하는 흐름: devA → patchK → slot1 → OPGW → slot2 → qK → devB
    //
    //   patchK: devA(OUT) → slot1(OUT), #5
    //     → slot1 진입: entryRole=targetRole=OUT → OPGW(roleAt=IN) 로 나감, nextCh=5
    //   OPGW: slot1(IN) → slot2(OUT), number=null
    //     → slot2 진입: entryRole=targetRole=OUT → qK(roleAt=IN) 로 나감, nextCh=null
    //   qK: slot2(IN) → devB, #5
    //     → devB 도달
    const patchK = await prisma.cable.create({
      data: {
        sourceAssetId: devA.id,
        targetAssetId: slot1.id,
        sourceRole: 'OUT',
        targetRole: 'OUT',   // slot1 의 OUT 포트에 접속 (patchK 진입 시 entryRole=OUT)
        number: 5,
        categoryId: catId,
      },
    });
    // OPGW: slot1(IN) → slot2(OUT)
    const opgw = await prisma.cable.create({
      data: {
        sourceAssetId: slot1.id,
        targetAssetId: slot2.id,
        sourceRole: 'IN',    // slot1 의 IN 포트에 연결
        targetRole: 'OUT',   // slot2 의 OUT 포트에 연결 (slot2 진입 시 entryRole=OUT)
        categoryId: catId,
      },
    });
    // qK: slot2(IN) → devB  (패치코드 #5, slot2 의 IN 포트에 연결)
    const qK = await prisma.cable.create({
      data: {
        sourceAssetId: slot2.id,
        targetAssetId: devB.id,
        sourceRole: 'IN',
        number: 5,
        categoryId: catId,
      },
    });

    const res = await request(app)
      .post('/api/trace')
      .set('Authorization', `Bearer ${token}`)
      .send({ seedCableId: patchK.id });

    expect(res.status).toBe(200);
    const data = res.body.data;
    // 시드 케이블의 양쪽 끝점(devA, slot1)은 반드시 포함
    expect(data.nodeIds).toContain(devA.id);
    expect(data.nodeIds).toContain(slot1.id);
    // 대국 설비(devB)도 strand 를 통해 포함
    expect(data.nodeIds).toContain(devB.id);
    // slot2 도 포함
    expect(data.nodeIds).toContain(slot2.id);
    // 케이블도 모두 포함
    expect(data.cableIds).toContain(patchK.id);
    expect(data.cableIds).toContain(qK.id);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 9) 존재하지 않는 seedCableId → 빈 결과(200)
  // ────────────────────────────────────────────────────────────────────────────
  it('9) 존재하지 않는 seedCableId → 빈 결과', async () => {
    const res = await request(app)
      .post('/api/trace')
      .set('Authorization', `Bearer ${token}`)
      .send({ seedCableId: 'non-existent-cable-id' });

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.nodeIds).toHaveLength(0);
    expect(data.cableIds).toHaveLength(0);
    expect(data.truncated).toBe(false);
  });
});
