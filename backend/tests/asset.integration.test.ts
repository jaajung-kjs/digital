import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { assetsRouter } from '../src/routes/assets.routes.js';
import { assetTypesRouter } from '../src/routes/assetTypes.routes.js';
import { authRouter } from '../src/routes/auth.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import prisma from '../src/config/prisma.js';

describe('Asset API 통합 테스트', () => {
  let app: Express;
  let adminToken: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    app.use('/api/asset-types', assetTypesRouter);
    app.use('/api/assets', assetsRouter);
    app.use(errorHandler);

    const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    adminToken = login.body.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('GET /api/asset-types 는 인증 시 시드된 종류를 반환', async () => {
    const res = await request(app).get('/api/asset-types').set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(res.body.data.some((t: any) => t.name === 'PITR-2000')).toBe(true);
  });

  it('GET /api/asset-types 는 인증 없이 401', async () => {
    await request(app).get('/api/asset-types').expect(401);
  });

});
