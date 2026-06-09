import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { authRouter } from '../src/routes/auth.routes.js';
import { substationsRouter } from '../src/routes/substations.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import prisma from '../src/config/prisma.js';

/**
 * SSOT-2b Task 1 — GET /api/substations/:id/workingcopy 벌크 로드.
 * 통합 working-copy 스토어가 단일 요청으로 전 컬렉션(assets+placement / cables /
 * distributionCircuits / fiberPaths)을 받을 수 있는지 검증한다.
 * production 라우트(substationsRouter)를 직접 마운트해 인증 게이팅까지 확인.
 */
describe('변전소 working-copy 벌크 로드 (GET /substations/:id/workingcopy)', () => {
  let app: Express;
  let token: string;
  let userId: string;
  let hqId: string, brId: string, subId: string, floorId: string, typeId: string, placementTypeId: string;
  let assetId: string, cableId: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    app.use('/api/substations', substationsRouter);
    app.use(errorHandler);

    const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    token = login.body.accessToken;
    userId = (await prisma.user.findFirstOrThrow({ where: { username: 'admin' } })).id;

    const hq = await prisma.headquarters.create({ data: { name: '__wc_hq__' } }); hqId = hq.id;
    const br = await prisma.branch.create({ data: { name: '__wc_br__', headquartersId: hq.id } }); brId = br.id;
    const sub = await prisma.substation.create({ data: { name: '__wc_sub__', branchId: br.id } }); subId = sub.id;
    const floor = await prisma.floor.create({ data: { substationId: subId, name: '__wc_floor__', createdById: userId, updatedById: userId } });
    floorId = floor.id;
    typeId = (await prisma.assetType.findFirstOrThrow({ where: { placementKind: null, isActive: true } })).id;
    // 케이블 endpoint 가 될 수 있는 배치형(RACK/DIST/OFD 제외) — GROUNDING.
    placementTypeId = (await prisma.assetType.findFirstOrThrow({ where: { placementKind: 'GROUNDING', isActive: true } })).id;

    // 배치 asset (positionX 세팅) — placement 컬럼 영속 확인용.
    const asset = await prisma.asset.create({
      data: { substationId: subId, assetTypeId: placementTypeId, name: 'WC_ASSET', floorId, positionX: 42, positionY: 7 },
    });
    assetId = asset.id;

    // 같은 변전소 asset 양끝 케이블 — 변전소 스코프 확인용.
    const cable = await prisma.cable.create({
      data: { sourceEquipmentId: assetId, targetEquipmentId: assetId, cableType: 'LAN' },
    });
    cableId = cable.id;
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

  it('200 — data 가 전 컬렉션(배열) 키를 가진다', async () => {
    const res = await request(app)
      .get(`/api/substations/${subId}/workingcopy`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const { data } = res.body;
    expect(Array.isArray(data.assets)).toBe(true);
    expect(Array.isArray(data.cables)).toBe(true);
    expect(Array.isArray(data.distributionCircuits)).toBe(true);
    expect(Array.isArray(data.fiberPaths)).toBe(true);
  });

  it('assets[0] 가 placement + 트리 + updatedAt 컬럼을 캐리한다', async () => {
    const res = await request(app)
      .get(`/api/substations/${subId}/workingcopy`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const asset = res.body.data.assets.find((a: any) => a.id === assetId);
    expect(asset).toBeDefined();
    for (const key of ['positionX', 'floorId', 'parentAssetId', 'slotIndex', 'updatedAt']) {
      expect(asset).toHaveProperty(key);
    }
    expect(asset.positionX).toBe(42);
    expect(asset.floorId).toBe(floorId);
  });

  it('cables 에 시드한 케이블이 변전소 스코프로 포함된다', async () => {
    const res = await request(app)
      .get(`/api/substations/${subId}/workingcopy`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const cable = res.body.data.cables.find((c: any) => c.id === cableId);
    expect(cable).toBeDefined();
  });

  it('인증 없음 → 401', async () => {
    await request(app).get(`/api/substations/${subId}/workingcopy`).expect(401);
  });
});
