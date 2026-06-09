import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { nodesRouter } from '../src/routes/nodes.routes.js';
import { authRouter } from '../src/routes/auth.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import prisma from '../src/config/prisma.js';

describe('노드 조상 경로 GET /api/nodes/:id/path', () => {
  let app: Express; let token: string;
  let hqId: string, brId: string, subId: string, floorId: string;
  beforeAll(async () => {
    app = express(); app.use(express.json());
    app.use('/api/auth', authRouter); app.use('/api/nodes', nodesRouter); app.use(errorHandler);
    token = (await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' })).body.accessToken;

    const hq = await prisma.headquarters.create({ data: { name: '__np_hq__' } }); hqId = hq.id;
    const br = await prisma.branch.create({ data: { name: '__np_br__', headquartersId: hq.id } }); brId = br.id;
    const sub = await prisma.substation.create({ data: { name: '__np_sub__', branchId: br.id } }); subId = sub.id;
    const floor = await prisma.floor.create({ data: { name: '__np_floor__', substationId: sub.id } }); floorId = floor.id;
  });
  afterAll(async () => {
    await prisma.floor.delete({ where: { id: floorId } }).catch(() => {});
    await prisma.substation.delete({ where: { id: subId } }).catch(() => {});
    await prisma.branch.delete({ where: { id: brId } }).catch(() => {});
    await prisma.headquarters.delete({ where: { id: hqId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('substation → [hq, branch, substation]', async () => {
    const res = await request(app)
      .get(`/api/nodes/${subId}/path?nodeType=substation`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data.map((x: { type: string }) => x.type)).toEqual([
      'headquarters', 'branch', 'substation',
    ]);
    expect(res.body.data[0].id).toBe(hqId);
    expect(res.body.data[1].id).toBe(brId);
    expect(res.body.data[2].id).toBe(subId);
  });

  it('floor → [hq, branch, substation, floor]', async () => {
    const res = await request(app)
      .get(`/api/nodes/${floorId}/path?nodeType=floor`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data).toHaveLength(4);
    expect(res.body.data.map((x: { type: string }) => x.type)).toEqual([
      'headquarters', 'branch', 'substation', 'floor',
    ]);
    expect(res.body.data[3].id).toBe(floorId);
  });

  it('branch → [hq, branch]', async () => {
    const res = await request(app)
      .get(`/api/nodes/${brId}/path?nodeType=branch`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.map((x: { type: string }) => x.type)).toEqual([
      'headquarters', 'branch',
    ]);
    expect(res.body.data[0].id).toBe(hqId);
    expect(res.body.data[1].id).toBe(brId);
  });

  it('headquarters → [hq]', async () => {
    const res = await request(app)
      .get(`/api/nodes/${hqId}/path?nodeType=headquarters`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toEqual({ id: hqId, type: 'headquarters' });
  });

  it('잘못된 nodeType → 400', async () => {
    await request(app)
      .get(`/api/nodes/${subId}/path?nodeType=bogus`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('인증 없으면 401', async () => {
    await request(app)
      .get(`/api/nodes/${subId}/path?nodeType=substation`)
      .expect(401);
  });
});
