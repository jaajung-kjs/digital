import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { assetCommitRouter } from '../src/routes/assetCommit.routes.js';
import { authRouter } from '../src/routes/auth.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import prisma from '../src/config/prisma.js';

describe('Asset 배치 커밋 + OCC', () => {
  let app: Express; let token: string;
  let hqId: string, brId: string, subId: string, typeId: string;
  const created: string[] = [];
  beforeAll(async () => {
    app = express(); app.use(express.json());
    app.use('/api/auth', authRouter); app.use('/api/substations', assetCommitRouter); app.use(errorHandler);
    token = (await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' })).body.accessToken;
    const hq = await prisma.headquarters.create({ data: { name: '__wc_hq__' } }); hqId = hq.id;
    const br = await prisma.branch.create({ data: { name: '__wc_br__', headquartersId: hq.id } }); brId = br.id;
    const sub = await prisma.substation.create({ data: { name: '__wc_sub__', branchId: br.id } }); subId = sub.id;
    typeId = (await prisma.assetType.findFirstOrThrow({ where: { placementKind: null, isActive: true } })).id;
  });
  afterAll(async () => {
    await prisma.asset.deleteMany({ where: { id: { in: created } } });
    await prisma.substation.delete({ where: { id: subId } }).catch(() => {});
    await prisma.branch.delete({ where: { id: brId } }).catch(() => {});
    await prisma.headquarters.delete({ where: { id: hqId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('create 커밋 → idMap 반환', async () => {
    const res = await request(app).post(`/api/substations/${subId}/assets/commit`).set('Authorization', `Bearer ${token}`)
      .send({ creates: [{ tempId: 'temp-1', assetTypeId: typeId, name: 'WC-1' }] }).expect(200);
    expect(res.body.data.idMap['temp-1']).toBeTruthy();
    created.push(res.body.data.idMap['temp-1']);
  });

  it('update — 올바른 baseVersion 이면 적용, 틀리면 409', async () => {
    const a = await prisma.asset.create({ data: { substationId: subId, assetTypeId: typeId, name: 'WC-2' } });
    created.push(a.id);
    const base = a.updatedAt.toISOString();
    await request(app).post(`/api/substations/${subId}/assets/commit`).set('Authorization', `Bearer ${token}`)
      .send({ updates: [{ id: a.id, baseVersion: base, patch: { name: 'WC-2b' } }] }).expect(200);
    const res = await request(app).post(`/api/substations/${subId}/assets/commit`).set('Authorization', `Bearer ${token}`)
      .send({ updates: [{ id: a.id, baseVersion: base, patch: { name: 'WC-2c' } }] }).expect(409);
    expect(res.body.error).toBe('CONFLICT');
    expect(res.body.details[0].id).toBe(a.id);
  });
});
