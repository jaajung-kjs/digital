import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { rackModulesRouter } from '../src/routes/rackModules.routes.js';
import { rackModuleCategoriesRouter } from '../src/routes/rackModuleCategories.routes.js';
import { equipmentRouter } from '../src/routes/equipment.routes.js';
import { authRouter } from '../src/routes/auth.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import prisma from '../src/config/prisma.js';

describe('RackModule slot API', () => {
  let app: Express;
  let adminToken: string;
  let rackId: string;
  let categoryId: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    app.use('/api/rack-modules', rackModulesRouter);
    app.use('/api/rack-module-categories', rackModuleCategoriesRouter);
    app.use('/api/equipment', equipmentRouter);
    app.use(errorHandler);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    adminToken = login.body.accessToken;

    // 테스트 랙 생성 — 첫 번째 floor 사용
    const floor = await prisma.floor.findFirst();
    if (!floor) throw new Error('no floor seeded — run seed first');

    const rack = await prisma.equipment.create({
      data: {
        floorId: floor.id,
        kind: 'RACK',
        name: 'TEST-RACK-SLOT',
        positionX: 0,
        positionY: 0,
        width2d: 60,
        height2d: 100,
        totalU: 12,
      },
    });
    rackId = rack.id;

    const cat = await prisma.rackModuleCategory.findFirst({ where: { isActive: true } });
    if (!cat) throw new Error('no category seeded');
    categoryId = cat.id;
  });

  it('creates module with slot fields', async () => {
    const res = await request(app)
      .post('/api/rack-modules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        rackEquipmentId: rackId,
        categoryId,
        name: 'TEST-MOD-1',
        slotIndex: 0,
        slotSpan: 2,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.slotIndex).toBe(0);
    expect(res.body.data.slotSpan).toBe(2);
  });

  it('rejects out-of-range slot', async () => {
    const res = await request(app)
      .post('/api/rack-modules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rackEquipmentId: rackId, categoryId, name: 'X', slotIndex: 10, slotSpan: 5 });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects overlapping slot', async () => {
    const res = await request(app)
      .post('/api/rack-modules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rackEquipmentId: rackId, categoryId, name: 'Y', slotIndex: 1, slotSpan: 1 });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('auto-generates name when omitted', async () => {
    const res = await request(app)
      .post('/api/rack-modules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rackEquipmentId: rackId, categoryId, slotIndex: 5, slotSpan: 1 });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toMatch(/^.+-\d+$/);
  });

  it('batch updates two modules atomically', async () => {
    const a = await prisma.rackModule.create({
      data: { rackEquipmentId: rackId, categoryId, name: 'A', slotIndex: 7, slotSpan: 2 },
    });
    const b = await prisma.rackModule.create({
      data: { rackEquipmentId: rackId, categoryId, name: 'B', slotIndex: 9, slotSpan: 2 },
    });
    const res = await request(app)
      .post('/api/rack-modules/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        updates: [
          { id: a.id, slotIndex: 7, slotSpan: 3 },
          { id: b.id, slotIndex: 10, slotSpan: 1 },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('batch rejects if projected state overlaps', async () => {
    const m = await prisma.rackModule.findFirst({ where: { rackEquipmentId: rackId } });
    if (!m) throw new Error();
    const res = await request(app)
      .post('/api/rack-modules/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ updates: [{ id: m.id, slotIndex: 0, slotSpan: 12 }] });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('returns categoryDefaultSlotSpan in response', async () => {
    const res = await request(app)
      .get('/api/rack-modules')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ rackEquipmentId: rackId });
    expect(res.body.data[0].categoryDefaultSlotSpan).toBeGreaterThanOrEqual(1);
  });
});
