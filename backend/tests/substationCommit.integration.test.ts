import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { authRouter } from '../src/routes/auth.routes.js';
import { authenticate } from '../src/middleware/auth.js';
import { validate } from '../src/middleware/validate.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import prisma from '../src/config/prisma.js';
import { commitSubstation } from '../src/services/substationCommit.service.js';
import { substationCommitSchema } from '../src/schemas/substationCommit.schema.js';
import { VersionConflictError } from '../src/services/concurrency.js';

/**
 * Task 2 는 서비스만 — 라우트는 Task 3. 핵심 동작(1~5)은 commitSubstation()
 * 를 in-process 로 직접 호출해 검증한다. 401/400(6)은 라우트 관심사이므로
 * 테스트 안에서 임시 라우트(authenticate + validate(스키마) + 서비스)를 엮어
 * Task 2 가 self-contained 하게 한다.
 */

describe('통합 변전소 커밋 (substationCommit) — 서비스 + OCC', () => {
  let app: Express;
  let token: string;
  let userId: string;
  let hqId: string, brId: string, subId: string, floorId: string, typeId: string, placementTypeId: string, rackTypeId: string;
  // 두 번째 변전소 (크로스 변전소 스코핑 검증용)
  let sub2Id: string, floor2Id: string, asset2Id: string;
  const createdAssets: string[] = [];

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    // 임시 라우트 — 401/400 검증용. Task 3 의 production 라우트와 별개.
    app.post(
      '/api/substations/:id/commit',
      authenticate,
      validate(substationCommitSchema),
      async (req, res, next) => {
        try {
          const result = await commitSubstation(req.params.id, req.body, req.user!.userId);
          res.json({ data: result });
        } catch (e) {
          next(e);
        }
      },
    );
    app.use(errorHandler);

    const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    token = login.body.accessToken;
    userId = (await prisma.user.findFirstOrThrow({ where: { username: 'admin' } })).id;

    const hq = await prisma.headquarters.create({ data: { name: '__sc_hq__' } }); hqId = hq.id;
    const br = await prisma.branch.create({ data: { name: '__sc_br__', headquartersId: hq.id } }); brId = br.id;
    const sub = await prisma.substation.create({ data: { name: '__sc_sub__', branchId: br.id } }); subId = sub.id;
    const floor = await prisma.floor.create({ data: { substationId: subId, name: '__sc_floor__', createdById: userId, updatedById: userId } });
    floorId = floor.id;
    typeId = (await prisma.assetType.findFirstOrThrow({ where: { placementKind: null, isActive: true } })).id;
    // 케이블 endpoint 가 될 수 있는 배치형(RACK/DIST/OFD 제외) — GROUNDING.
    placementTypeId = (await prisma.assetType.findFirstOrThrow({ where: { placementKind: 'GROUNDING', isActive: true } })).id;
    // 랙(RACK) — 랙 모듈의 부모가 될 수 있는 배치형. 모듈 카테고리는 placementKind=null(typeId).
    rackTypeId = (await prisma.assetType.findFirstOrThrow({ where: { placementKind: 'RACK', isActive: true } })).id;

    // 두 번째 변전소 + 자체 floor/asset — 크로스 변전소 mutation 차단 검증용.
    const sub2 = await prisma.substation.create({ data: { name: '__sc_sub2__', branchId: br.id } }); sub2Id = sub2.id;
    const floor2 = await prisma.floor.create({ data: { substationId: sub2Id, name: '__sc_floor2__', createdById: userId, updatedById: userId } });
    floor2Id = floor2.id;
    const a2 = await prisma.asset.create({ data: { substationId: sub2Id, assetTypeId: typeId, name: 'SUB2_ASSET', floorId: floor2Id, positionX: 5 } });
    asset2Id = a2.id;
  });

  afterAll(async () => {
    await prisma.cable.deleteMany({ where: { OR: [
      { sourceAsset: { substationId: subId } },
      { targetAsset: { substationId: subId } },
    ] } }).catch(() => {});
    await prisma.asset.deleteMany({ where: { substationId: { in: [subId, sub2Id] } } }).catch(() => {});
    await prisma.floor.delete({ where: { id: floorId } }).catch(() => {});
    await prisma.floor.delete({ where: { id: floor2Id } }).catch(() => {});
    await prisma.substation.delete({ where: { id: subId } }).catch(() => {});
    await prisma.substation.delete({ where: { id: sub2Id } }).catch(() => {});
    await prisma.branch.delete({ where: { id: brId } }).catch(() => {});
    await prisma.headquarters.delete({ where: { id: hqId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('1) assets+cables 통합 create — tempId 교차해소(단일 assetId) + placement 영속', async () => {
    const input = substationCommitSchema.parse({
      assets: { creates: [{ tempId: 'a1', assetTypeId: placementTypeId, name: '랙1', floorId, positionX: 10, positionY: 20, width2d: 100, height2d: 200 }] },
      // 단계4b — endpoint 는 단일 sourceAssetId/targetAssetId(tempId 교차해소). nested 없음.
      cables: { creates: [{ tempId: 'c1', sourceAssetId: 'a1', targetAssetId: 'a1' }] },
    });
    const res = await commitSubstation(subId, input, userId);

    const aId = res.idMaps.assets['a1'];
    const cId = res.idMaps.cables['c1'];
    expect(aId).toMatch(/^[0-9a-f-]{36}$/);
    expect(cId).toMatch(/^[0-9a-f-]{36}$/);
    createdAssets.push(aId);

    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: aId } });
    expect(asset.positionX).toBe(10);
    expect(asset.positionY).toBe(20);
    expect(asset.width2d).toBe(100);
    expect(asset.height2d).toBe(200);
    expect(asset.floorId).toBe(floorId);

    const cable = await prisma.cable.findUniqueOrThrow({ where: { id: cId } });
    // 단계4c — endpoint = 단일 source_asset_id/target_asset_id(레거시 컬럼은 드롭됨).
    expect(cable.sourceAssetId).toBe(aId);
    expect(cable.targetAssetId).toBe(aId);
  });

  it('1b) cable create — 단일 sourceAssetId/targetAssetId 만으로 source_asset_id 기록', async () => {
    const setup = substationCommitSchema.parse({
      assets: {
        creates: [
          { tempId: 'b1', assetTypeId: placementTypeId, name: '노드A', floorId, positionX: 0, positionY: 0, width2d: 10, height2d: 10 },
          { tempId: 'b2', assetTypeId: placementTypeId, name: '노드B', floorId, positionX: 5, positionY: 5, width2d: 10, height2d: 10 },
        ],
      },
      cables: { creates: [{ tempId: 'cAsset', sourceAssetId: 'b1', targetAssetId: 'b2' }] },
    });
    const res = await commitSubstation(subId, setup, userId);
    const b1 = res.idMaps.assets['b1'];
    const b2 = res.idMaps.assets['b2'];
    createdAssets.push(b1, b2);
    const cId = res.idMaps.cables['cAsset'];

    const cable = await prisma.cable.findUniqueOrThrow({ where: { id: cId } });
    // 단일 assetId → source_asset_id/target_asset_id 만(레거시 컬럼은 4c 에서 드롭).
    expect(cable.sourceAssetId).toBe(b1);
    expect(cable.targetAssetId).toBe(b2);
  });

  it('2) asset update — 올바른 baseVersion → 적용 + updatedAt 변경', async () => {
    const a = await prisma.asset.create({ data: { substationId: subId, assetTypeId: typeId, name: 'U1', floorId, positionX: 1 } });
    createdAssets.push(a.id);
    const base = a.updatedAt.toISOString();

    const input = substationCommitSchema.parse({
      assets: { updates: [{ id: a.id, baseVersion: base, patch: { positionX: 999 } }] },
    });
    await commitSubstation(subId, input, userId);

    const after = await prisma.asset.findUniqueOrThrow({ where: { id: a.id } });
    expect(after.positionX).toBe(999);
    expect(after.updatedAt.toISOString()).not.toBe(base);
  });

  it('3) asset update — WRONG baseVersion → 409, 충돌 asset 식별', async () => {
    const a = await prisma.asset.create({ data: { substationId: subId, assetTypeId: typeId, name: 'W1' } });
    createdAssets.push(a.id);
    const wrong = new Date(a.updatedAt.getTime() - 60000).toISOString();

    const input = substationCommitSchema.parse({
      assets: { updates: [{ id: a.id, baseVersion: wrong, patch: { name: 'W1b' } }] },
    });
    let err: VersionConflictError | null = null;
    try {
      await commitSubstation(subId, input, userId);
    } catch (e) {
      err = e as VersionConflictError;
    }
    expect(err).toBeInstanceOf(VersionConflictError);
    expect(err!.conflicts[0].id).toBe(a.id);
    expect(err!.conflicts[0].name).toBe('W1');

    // name 은 안 바뀌어야 (롤백)
    const after = await prisma.asset.findUniqueOrThrow({ where: { id: a.id } });
    expect(after.name).toBe('W1');
  });

  it('4) atomicity — valid asset create + WRONG cable delete baseVersion → 409 + asset 미영속', async () => {
    const cable = await prisma.cable.create({
      // 단계4b — endpoint 스코핑은 source_asset_id 로. (OCC delete 가 sourceAsset.substationId 로 찾음)
      data: { sourceAssetId: createdAssets[0], targetAssetId: createdAssets[0] },
    });
    const wrong = new Date(cable.updatedAt.getTime() - 60000).toISOString();

    const before = await prisma.asset.count({ where: { substationId: subId, name: 'ATOMIC_X' } });
    expect(before).toBe(0);

    const input = substationCommitSchema.parse({
      assets: { creates: [{ tempId: 'ax', assetTypeId: typeId, name: 'ATOMIC_X' }] },
      cables: { deletes: [{ id: cable.id, baseVersion: wrong }] },
    });
    let err: VersionConflictError | null = null;
    try {
      await commitSubstation(subId, input, userId);
    } catch (e) {
      err = e as VersionConflictError;
    }
    expect(err).toBeInstanceOf(VersionConflictError);
    expect(err!.conflicts.some((c) => c.collection === 'cables' && c.id === cable.id)).toBe(true);

    // 롤백 — asset 이 생기지 않았어야
    const after = await prisma.asset.count({ where: { substationId: subId, name: 'ATOMIC_X' } });
    expect(after).toBe(0);
    // 케이블도 여전히 존재
    expect(await prisma.cable.findUnique({ where: { id: cable.id } })).not.toBeNull();
    await prisma.cable.delete({ where: { id: cable.id } }).catch(() => {});
  });

  it('4b) endpoint asset delete → source_asset_id ON DELETE CASCADE 로 케이블도 제거', async () => {
    // endpoint asset + 그 asset 을 source 로 하는 케이블을 단일 assetId 로 커밋.
    const setup = substationCommitSchema.parse({
      assets: {
        creates: [
          { tempId: 'cas', assetTypeId: placementTypeId, name: 'CASCADE-EP', floorId, positionX: 1, positionY: 1, width2d: 4, height2d: 4 },
          { tempId: 'cas2', assetTypeId: placementTypeId, name: 'CASCADE-EP2', floorId, positionX: 9, positionY: 9, width2d: 4, height2d: 4 },
        ],
      },
      cables: { creates: [{ tempId: 'cc', sourceAssetId: 'cas', targetAssetId: 'cas2' }] },
    });
    const res = await commitSubstation(subId, setup, userId);
    const epId = res.idMaps.assets['cas'];
    const ep2Id = res.idMaps.assets['cas2'];
    const cId = res.idMaps.cables['cc'];
    createdAssets.push(epId, ep2Id);

    // endpoint asset(cas) 삭제 → 케이블 cascade.
    const ep = await prisma.asset.findUniqueOrThrow({ where: { id: epId } });
    const del = substationCommitSchema.parse({
      assets: { deletes: [{ id: epId, baseVersion: ep.updatedAt.toISOString() }] },
    });
    await commitSubstation(subId, del, userId);

    expect(await prisma.asset.findUnique({ where: { id: epId } })).toBeNull();
    // source_asset_id FK 의 onDelete: Cascade 로 케이블이 함께 삭제됐는지.
    expect(await prisma.cable.findUnique({ where: { id: cId } })).toBeNull();
  });

  it('5) floor — 올바른 baseVersion → settings 적용, WRONG → 409', async () => {
    const f0 = await prisma.floor.findUniqueOrThrow({ where: { id: floorId } });
    const base = f0.updatedAt.toISOString();

    const ok = substationCommitSchema.parse({
      floor: { id: floorId, baseVersion: base, settings: { gridSize: 50 } },
    });
    const res = await commitSubstation(subId, ok, userId);
    expect(res.updated.floor?.id).toBe(floorId);
    const f1 = await prisma.floor.findUniqueOrThrow({ where: { id: floorId } });
    expect(f1.gridSize).toBe(50);

    const wrong = substationCommitSchema.parse({
      floor: { id: floorId, baseVersion: base, settings: { gridSize: 99 } },
    });
    let err: VersionConflictError | null = null;
    try {
      await commitSubstation(subId, wrong, userId);
    } catch (e) {
      err = e as VersionConflictError;
    }
    expect(err).toBeInstanceOf(VersionConflictError);
    expect(err!.conflicts[0].collection).toBe('floor');
    // gridSize 가 99 로 안 바뀌었어야
    const f2 = await prisma.floor.findUniqueOrThrow({ where: { id: floorId } });
    expect(f2.gridSize).toBe(50);
  });

  // 전역 커밋: 변전소 스코프가 없으므로 다른 변전소의 노드/엣지/floor 도 같은 커밋으로 변경된다
  // (자산 A는 어디서든 자산 A — 변전소 A·B 자산을 한 번에 고쳐 한 트랜잭션으로 저장).
  it('M4a) 전역: 다른 변전소 asset update 도 성공(변전소 스코프 없음)', async () => {
    const a2before = await prisma.asset.findUniqueOrThrow({ where: { id: asset2Id } });
    const input = substationCommitSchema.parse({
      assets: { updates: [{ id: asset2Id, baseVersion: a2before.updatedAt.toISOString(), patch: { positionX: 777 } }] },
    });
    await commitSubstation(subId, input, userId); // subId(sub1) 컨텍스트지만 sub2 자산도 전역으로 갱신
    const a2after = await prisma.asset.findUniqueOrThrow({ where: { id: asset2Id } });
    expect(a2after.positionX).toBe(777);
  });

  it('M4b) 전역: 다른 변전소 asset delete 도 성공', async () => {
    const a2before = await prisma.asset.findUniqueOrThrow({ where: { id: asset2Id } });
    const input = substationCommitSchema.parse({
      assets: { deletes: [{ id: asset2Id, baseVersion: a2before.updatedAt.toISOString() }] },
    });
    await commitSubstation(subId, input, userId);
    expect(await prisma.asset.findUnique({ where: { id: asset2Id } })).toBeNull();
  });

  it('M4c) 전역: 다른 변전소 floor 도 성공', async () => {
    const f2before = await prisma.floor.findUniqueOrThrow({ where: { id: floor2Id } });
    const input = substationCommitSchema.parse({
      floor: { id: floor2Id, baseVersion: f2before.updatedAt.toISOString(), settings: { gridSize: 123 } },
    });
    await commitSubstation(subId, input, userId);
    const f2after = await prisma.floor.findUniqueOrThrow({ where: { id: floor2Id } });
    expect(f2after.gridSize).toBe(123);
  });

  // ── 하위 자산 단일 경로 통합(rackModules 경로 폐지) 회귀 검증 ──
  it('U1) 랙 모듈을 통합 assets 컬렉션으로 create — slotIndex/slotSpan + parentAssetId(실 랙) 영속 + substationId 정상', async () => {
    // 먼저 랙(부모) 자산 생성.
    const rack = await prisma.asset.create({
      data: { substationId: subId, assetTypeId: rackTypeId, name: '랙U1', floorId, positionX: 3, positionY: 3, width2d: 20, height2d: 40 },
    });
    createdAssets.push(rack.id);

    // 랙 모듈을 assets 컬렉션으로 — parentAssetId=실제 랙, slotIndex/slotSpan 동반.
    const input = substationCommitSchema.parse({
      assets: {
        creates: [
          { tempId: 'mod1', assetTypeId: typeId, name: '모듈U1', parentAssetId: rack.id, slotIndex: 0, slotSpan: 2 },
        ],
      },
    });
    const res = await commitSubstation(subId, input, userId);
    const modId = res.idMaps.assets['mod1'];
    expect(modId).toMatch(/^[0-9a-f-]{36}$/);
    createdAssets.push(modId);

    const mod = await prisma.asset.findUniqueOrThrow({ where: { id: modId } });
    expect(mod.parentAssetId).toBe(rack.id);
    expect(mod.slotIndex).toBe(0);
    expect(mod.slotSpan).toBe(2);
    // 전역 라우트의 substationId='' 폴백 버그 회귀 — substationId 가 올바르게 채워져야(FK 위반 없음).
    expect(mod.substationId).toBe(subId);

    // 슬롯 충돌 검증이 유지되는지 — 같은 슬롯(1, 겹침)에 또 만들면 충돌.
    const collide = substationCommitSchema.parse({
      assets: { creates: [{ tempId: 'mod2', assetTypeId: typeId, name: '모듈충돌', parentAssetId: rack.id, slotIndex: 1, slotSpan: 1 }] },
    });
    await expect(commitSubstation(subId, collide, userId)).rejects.toThrow();
  });

  it('U2) 부모+자식 단일 커밋 — 자식 parentAssetId=부모 tempId 가 부모 실 id 로 해소', async () => {
    // feeder(부모) + branch(자식, parentAssetId=feeder tempId) 를 한 커밋에. 슬롯 없음(slotIndex=null).
    const input = substationCommitSchema.parse({
      assets: {
        creates: [
          { tempId: 'feeder1', assetTypeId: typeId, name: 'FEEDER1' },
          { tempId: 'branch1', assetTypeId: typeId, name: 'BRANCH1', parentAssetId: 'feeder1' },
        ],
      },
    });
    const res = await commitSubstation(subId, input, userId);
    const feederId = res.idMaps.assets['feeder1'];
    const branchId = res.idMaps.assets['branch1'];
    expect(feederId).toMatch(/^[0-9a-f-]{36}$/);
    expect(branchId).toMatch(/^[0-9a-f-]{36}$/);
    createdAssets.push(feederId, branchId);

    const branch = await prisma.asset.findUniqueOrThrow({ where: { id: branchId } });
    // tempId('feeder1') 가 부모의 실 id 로 해소돼야(FK 위반 없음).
    expect(branch.parentAssetId).toBe(feederId);
    expect(branch.slotIndex).toBeNull();
  });

  // ── 조직트리 워킹카피 통합(Task 3) — HQ→지사→변전소→층→자산 단일 커밋 + tempId 재매핑 ──
  it('O1) org 위상정렬 create — HQ→지사→변전소→층(temp 부모) + 자산 substationId/floorId(temp) 해소', async () => {
    const input = substationCommitSchema.parse({
      headquarters: { creates: [{ tempId: 'oh', name: '__org_hq__' }] },
      branches: { creates: [{ tempId: 'ob', headquartersId: 'oh', name: '__org_br__' }] },
      substations: { creates: [{ tempId: 'os', branchId: 'ob', name: '__org_sub__', address: '주소1' }] },
      floors: { creates: [{ tempId: 'of', substationId: 'os', name: '__org_floor__', floorNumber: 'B1' }] },
      assets: {
        creates: [
          { tempId: 'oa', assetTypeId: typeId, name: '__org_asset__', substationId: 'os', floorId: 'of', positionX: 1, positionY: 2 },
        ],
      },
    });
    // substationId='' — 전역 라우트(자산이 자기 substationId 를 싣는 경로)와 동일하게 빈 컨텍스트.
    const res = await commitSubstation('', input, userId);

    const newHq = res.idMaps.headquarters['oh'];
    const newBr = res.idMaps.branches['ob'];
    const newSub = res.idMaps.substations['os'];
    const newFloor = res.idMaps.floors['of'];
    const newAsset = res.idMaps.assets['oa'];
    for (const id of [newHq, newBr, newSub, newFloor, newAsset]) expect(id).toMatch(/^[0-9a-f-]{36}$/);

    // 위상정렬 부모 FK 해소.
    const br = await prisma.branch.findUniqueOrThrow({ where: { id: newBr } });
    expect(br.headquartersId).toBe(newHq);
    const sub = await prisma.substation.findUniqueOrThrow({ where: { id: newSub } });
    expect(sub.branchId).toBe(newBr);
    const floor = await prisma.floor.findUniqueOrThrow({ where: { id: newFloor } });
    expect(floor.substationId).toBe(newSub);

    // 핵심: 자산의 substationId/floorId 가 새로 만든 변전소/층 real id 로 해소.
    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: newAsset } });
    expect(asset.substationId).toBe(newSub);
    expect(asset.floorId).toBe(newFloor);

    // cleanup — HQ 삭제 시 cascade 로 지사/변전소/층/자산 모두 제거.
    await prisma.headquarters.delete({ where: { id: newHq } }).catch(() => {});
  });

  it('6) 인증 없음 → 401, malformed body → 400', async () => {
    await request(app).post(`/api/substations/${subId}/commit`).send({}).expect(401);

    // assetCreate 에 필수 필드(assetTypeId/name) 누락 → zod 400
    await request(app)
      .post(`/api/substations/${subId}/commit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ assets: { creates: [{ tempId: 'bad' }] } })
      .expect(400);
  });
});
