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
    const pitr = await prisma.assetType.findFirstOrThrow({ where: { name: 'PITR-2000' } });
    pitrTypeId = pitr.id;

    // 자산 쓰기는 unified commit 으로만 가능 — read 테스트용 fixture 는 prisma 로 직접 시드한다.
    const asset = await prisma.asset.create({
      data: { substationId, assetTypeId: pitrTypeId, name: 'PITR-통합-1' },
    });
    createdAssetIds.push(asset.id);
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
    expect(res.body.data.some((t: any) => t.name === 'PITR-2000')).toBe(true);
  });

  it('GET /api/asset-types 는 인증 없이 401', async () => {
    await request(app).get('/api/asset-types').expect(401);
  });

  it('GET /api/substations/:id/assets 는 시드된 자산을 목록에 포함', async () => {
    const res = await request(app)
      .get(`/api/substations/${substationId}/assets`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.data.some((a: any) => a.name === 'PITR-통합-1')).toBe(true);
  });
});
