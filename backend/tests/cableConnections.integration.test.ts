import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { assetsRouter } from '../src/routes/assets.routes.js';
import { assetCommitRouter } from '../src/routes/assetCommit.routes.js';
import { authRouter } from '../src/routes/auth.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import prisma from '../src/config/prisma.js';

describe('연결 조회 — 변전소/자산', () => {
  let app: Express; let token: string;
  let hqId: string, brId: string, subId: string, typeId: string;
  let a1Id: string, a2Id: string, cableId: string;
  let rackId: string, moduleId: string, moduleCableId: string;
  let distId: string, circuitId: string, circuitCableId: string;

  beforeAll(async () => {
    app = express(); app.use(express.json());
    app.use('/api/auth', authRouter);
    app.use('/api/assets', assetsRouter);
    app.use('/api/substations', assetCommitRouter);
    app.use(errorHandler);

    token = (
      await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' })
    ).body.accessToken;

    const hq = await prisma.headquarters.create({ data: { name: '__conn_hq__' } }); hqId = hq.id;
    const br = await prisma.branch.create({ data: { name: '__conn_br__', headquartersId: hq.id } }); brId = br.id;
    const sub = await prisma.substation.create({ data: { name: '__conn_sub__', branchId: br.id } }); subId = sub.id;
    typeId = (await prisma.assetType.findFirstOrThrow({ where: { placementKind: null, isActive: true } })).id;

    const a1 = await prisma.asset.create({ data: { substationId: subId, assetTypeId: typeId, name: 'CONN-A1' } });
    const a2 = await prisma.asset.create({ data: { substationId: subId, assetTypeId: typeId, name: 'CONN-A2' } });
    a1Id = a1.id; a2Id = a2.id;

    const cable = await prisma.cable.create({
      // 단계4b — endpoint = 단일 source_asset_id/target_asset_id.
      data: { sourceAssetId: a1.id, targetAssetId: a2.id, cableType: 'LAN' },
    });
    cableId = cable.id;

    // 모듈 endpoint: rack 자산 + 자식 모듈 자산 (endpoint = 모듈 asset id)
    const rack = await prisma.asset.create({ data: { substationId: subId, assetTypeId: typeId, name: 'CONN-RACK' } });
    rackId = rack.id;
    const module = await prisma.asset.create({
      data: { substationId: subId, assetTypeId: typeId, name: 'CONN-MOD', parentAssetId: rack.id },
    });
    moduleId = module.id;
    const moduleCable = await prisma.cable.create({
      data: { sourceAssetId: module.id, targetAssetId: a2.id, cableType: 'LAN' },
    });
    moduleCableId = moduleCable.id;

    // 분기 endpoint: 분전반 자산 → 분기(BRANCH) asset (endpoint = 분기 asset id).
    // 단계4b — 회로는 distribution_circuits 행이 아니라 Asset 계층. branch asset 을 직접 endpoint 로.
    const dist = await prisma.asset.create({ data: { substationId: subId, assetTypeId: typeId, name: 'CONN-DIST' } });
    distId = dist.id;
    const branch = await prisma.asset.create({
      data: { substationId: subId, assetTypeId: typeId, name: 'L1', parentAssetId: dist.id },
    });
    circuitId = branch.id;
    const circuitCable = await prisma.cable.create({
      data: { sourceAssetId: branch.id, targetAssetId: a1.id, cableType: 'DC' },
    });
    circuitCableId = circuitCable.id;
  });

  afterAll(async () => {
    await prisma.cable.deleteMany({ where: { id: { in: [cableId, moduleCableId, circuitCableId] } } }).catch(() => {});
    await prisma.asset.deleteMany({ where: { id: { in: [a1Id, a2Id, moduleId, rackId, distId, circuitId] } } });
    await prisma.substation.delete({ where: { id: subId } }).catch(() => {});
    await prisma.branch.delete({ where: { id: brId } }).catch(() => {});
    await prisma.headquarters.delete({ where: { id: hqId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('GET /api/substations/:id/connections — 변전소 케이블 + 이름 resolve', async () => {
    const res = await request(app)
      .get(`/api/substations/${subId}/connections`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    const c = res.body.data.find((x: any) => x.id === cableId);
    expect(c).toBeTruthy();
    expect(c.source.name).toBe('CONN-A1');
    expect(c.target.name).toBe('CONN-A2');
  });

  it('GET /api/assets/:id/connections — a1 의 연결', async () => {
    const res = await request(app)
      .get(`/api/assets/${a1Id}/connections`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.some((x: any) => x.id === cableId)).toBe(true);
  });

  it('GET /api/assets/:id/connections — a2 의 연결', async () => {
    const res = await request(app)
      .get(`/api/assets/${a2Id}/connections`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.some((x: any) => x.id === cableId)).toBe(true);
  });

  it('모듈 endpoint — 변전소 + 자산(모듈) 연결 조회', async () => {
    const subRes = await request(app)
      .get(`/api/substations/${subId}/connections`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(subRes.body.data.some((x: any) => x.id === moduleCableId)).toBe(true);

    const modRes = await request(app)
      .get(`/api/assets/${moduleId}/connections`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const mc = modRes.body.data.find((x: any) => x.id === moduleCableId);
    expect(mc).toBeTruthy();
    // 단계4b — endpoint = 단일 assetId. 모듈 endpoint 면 source/target.assetId 가 모듈 id.
    expect([mc.source.assetId, mc.target.assetId]).toContain(moduleId);
  });

  it('분기 endpoint — 변전소 연결 조회 + 이름 resolve (C1)', async () => {
    const res = await request(app)
      .get(`/api/substations/${subId}/connections`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const cc = res.body.data.find((x: any) => x.id === circuitCableId);
    expect(cc).toBeTruthy();
    // 분기 endpoint 의 assetId = branch asset id, name = branch asset 이름(L1).
    const branchEndpoint = cc.source.assetId === circuitId ? cc.source : cc.target;
    expect(branchEndpoint.assetId).toBe(circuitId);
    expect(branchEndpoint.name).toBe('L1');
  });
});
