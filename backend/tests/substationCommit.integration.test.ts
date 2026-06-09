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
  let hqId: string, brId: string, subId: string, floorId: string, typeId: string, placementTypeId: string;
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
  });

  afterAll(async () => {
    await prisma.cable.deleteMany({ where: { OR: [
      { sourceEquipment: { substationId: subId } },
      { targetEquipment: { substationId: subId } },
    ] } }).catch(() => {});
    await prisma.asset.deleteMany({ where: { substationId: subId } }).catch(() => {});
    await prisma.floor.delete({ where: { id: floorId } }).catch(() => {});
    await prisma.substation.delete({ where: { id: subId } }).catch(() => {});
    await prisma.branch.delete({ where: { id: brId } }).catch(() => {});
    await prisma.headquarters.delete({ where: { id: hqId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('1) assets+cables 통합 create — tempId 교차해소 + placement 영속', async () => {
    const input = substationCommitSchema.parse({
      assets: { creates: [{ tempId: 'a1', assetTypeId: placementTypeId, name: '랙1', floorId, positionX: 10, positionY: 20, width2d: 100, height2d: 200 }] },
      cables: { creates: [{ tempId: 'c1', source: { equipmentId: 'a1' }, target: { equipmentId: 'a1' }, cableType: 'LAN' }] },
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
    expect(cable.sourceEquipmentId).toBe(aId);
    expect(cable.targetEquipmentId).toBe(aId);
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
      data: { sourceEquipmentId: createdAssets[0], targetEquipmentId: createdAssets[0], cableType: 'LAN' },
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
