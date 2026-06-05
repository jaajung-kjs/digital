import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { floorsRouter } from '../src/routes/floors.routes.js';
import { authRouter } from '../src/routes/auth.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import prisma from '../src/config/prisma.js';

describe('FloorPlan OCC (baseFloorVersion 동시성 검사)', () => {
  let app: Express;
  let token: string;
  let hqId: string, branchId: string, subId: string, floorId: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json({ limit: '10mb' }));
    app.use('/api/auth', authRouter);
    app.use('/api/floors', floorsRouter);
    app.use(errorHandler);

    const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    token = login.body.accessToken;

    const hq = await prisma.headquarters.create({ data: { name: '__occ_hq__' } });
    hqId = hq.id;
    const br = await prisma.branch.create({ data: { name: '__occ_br__', headquartersId: hq.id } });
    branchId = br.id;
    const sub = await prisma.substation.create({ data: { name: '__occ_sub__', branchId: br.id } });
    subId = sub.id;
    const floor = await prisma.floor.create({ data: { substationId: sub.id, name: '__occ_floor__', floorNumber: '1' } });
    floorId = floor.id;
  });

  afterAll(async () => {
    await prisma.floor.delete({ where: { id: floorId } }).catch(() => {});
    await prisma.substation.delete({ where: { id: subId } }).catch(() => {});
    await prisma.branch.delete({ where: { id: branchId } }).catch(() => {});
    await prisma.headquarters.delete({ where: { id: hqId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('baseFloorVersion 이 최신이면 200, stale 이면 409', async () => {
    const plan = await request(app).get(`/api/floors/${floorId}/plan`).set('Authorization', `Bearer ${token}`).expect(200);
    const base: string = plan.body.data.updatedAt;
    await request(app).put(`/api/floors/${floorId}/plan`).set('Authorization', `Bearer ${token}`)
      .send({ canvasWidth: 2100, baseFloorVersion: base }).expect(200);
    const res = await request(app).put(`/api/floors/${floorId}/plan`).set('Authorization', `Bearer ${token}`)
      .send({ canvasWidth: 2200, baseFloorVersion: base }).expect(409);
    expect(res.body.error).toBe('CONFLICT');
  });

  it('baseFloorVersion 미동봉이면 검사 생략(200)', async () => {
    await request(app).put(`/api/floors/${floorId}/plan`).set('Authorization', `Bearer ${token}`)
      .send({ canvasWidth: 2300 }).expect(200);
  });
});
