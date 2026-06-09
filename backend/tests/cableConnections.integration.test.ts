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
      data: { sourceEquipmentId: a1.id, targetEquipmentId: a2.id, cableType: 'LAN' },
    });
    cableId = cable.id;
  });

  afterAll(async () => {
    await prisma.cable.delete({ where: { id: cableId } }).catch(() => {});
    await prisma.asset.deleteMany({ where: { id: { in: [a1Id, a2Id] } } });
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
});
