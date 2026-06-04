import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { assetsRouter } from '../src/routes/assets.routes.js';
import { assetTypesRouter } from '../src/routes/assetTypes.routes.js';
import { assetController } from '../src/controllers/asset.controller.js';
import { authenticate } from '../src/middleware/auth.js';
import { authRouter } from '../src/routes/auth.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import prisma from '../src/config/prisma.js';

describe('Asset API 통합 테스트', () => {
  let app: Express;
  let adminToken: string;
  let substationId: string;
  let pitrTypeId: string;
  let hqId: string;
  let branchId: string;
  const createdAssetIds: string[] = [];

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    app.use('/api/asset-types', assetTypesRouter);
    app.use('/api/assets', assetsRouter);
    app.get('/api/substations/:substationId/assets', authenticate, assetController.listBySubstation);
    app.use(errorHandler);

    const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    adminToken = login.body.accessToken;

    const hq = await prisma.headquarters.create({ data: { name: '__test_hq__' } });
    hqId = hq.id;
    const branch = await prisma.branch.create({ data: { name: '__test_branch__', headquartersId: hq.id } });
    branchId = branch.id;
    const sub = await prisma.substation.create({ data: { name: '__test_sub__', branchId: branch.id } });
    substationId = sub.id;
    const pitr = await prisma.assetType.findUniqueOrThrow({ where: { code: 'PITR' } });
    pitrTypeId = pitr.id;
  });

  afterAll(async () => {
    await prisma.asset.deleteMany({ where: { id: { in: createdAssetIds } } });
    await prisma.substation.delete({ where: { id: substationId } }).catch(() => {});
    await prisma.branch.delete({ where: { id: branchId } }).catch(() => {});
    await prisma.headquarters.delete({ where: { id: hqId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('GET /api/asset-types 는 인증 시 시드된 종류를 반환', async () => {
    const res = await request(app).get('/api/asset-types').set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(res.body.data.some((t: any) => t.code === 'PITR')).toBe(true);
  });

  it('GET /api/asset-types 는 인증 없이 401', async () => {
    await request(app).get('/api/asset-types').expect(401);
  });

  it('POST /api/assets 는 substation+type+name 만으로 생성', async () => {
    const res = await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ substationId, assetTypeId: pitrTypeId, name: 'PITR-통합-1' })
      .expect(201);
    expect(res.body.data.name).toBe('PITR-통합-1');
    expect(res.body.data.assetType.code).toBe('PITR');
    createdAssetIds.push(res.body.data.id);
  });

  it('POST /api/assets 는 name 누락 시 400', async () => {
    await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ substationId, assetTypeId: pitrTypeId })
      .expect(400);
  });

  it('GET /api/substations/:id/assets 는 생성한 자산을 목록에 포함', async () => {
    const res = await request(app)
      .get(`/api/substations/${substationId}/assets`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.data.some((a: any) => a.name === 'PITR-통합-1')).toBe(true);
  });

  it('POST /api/assets/:id/duplicate 는 (복제) 이름으로 복사', async () => {
    const base = await request(app)
      .post('/api/assets').set('Authorization', `Bearer ${adminToken}`)
      .send({ substationId, assetTypeId: pitrTypeId, name: 'PITR-원본' }).expect(201);
    createdAssetIds.push(base.body.data.id);
    const dup = await request(app)
      .post(`/api/assets/${base.body.data.id}/duplicate`)
      .set('Authorization', `Bearer ${adminToken}`).expect(201);
    expect(dup.body.data.name).toBe('PITR-원본 (복제)');
    createdAssetIds.push(dup.body.data.id);
  });
});
