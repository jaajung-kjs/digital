import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { authRouter } from '../src/routes/auth.routes.js';
import { assetsRouter } from '../src/routes/assets.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import prisma from '../src/config/prisma.js';

describe('POST /api/assets/refs', () => {
  let app: Express;
  let token: string;

  // 테스트 전용 조직 트리 id
  let hqId: string, brId: string, subId: string;
  // assetType (ofd 역할)
  let ofdTypeId: string;
  // 자산
  let assetId: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    app.use('/api/assets', assetsRouter);
    app.use(errorHandler);

    // 로그인
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    token = login.body.accessToken;

    // 조직 트리
    const hq = await prisma.headquarters.create({ data: { name: '__refs_hq__' } });
    hqId = hq.id;
    const br = await prisma.branch.create({ data: { name: '__refs_br__', headquartersId: hqId } });
    brId = br.id;
    const sub = await prisma.substation.create({ data: { name: '__refs_sub__', branchId: brId } });
    subId = sub.id;

    // AssetType — 기존 시드에서 찾는다. 없으면 생성.
    const existing = await prisma.assetType.findFirst({ where: { role: 'ofd' } });
    if (existing) {
      ofdTypeId = existing.id;
    } else {
      const created = await prisma.assetType.create({ data: { name: '__refs_ofd_type__', role: 'ofd' } });
      ofdTypeId = created.id;
    }

    // 자산 1개 생성
    const asset = await prisma.asset.create({
      data: { substationId: subId, assetTypeId: ofdTypeId, name: '__refs_asset__' },
    });
    assetId = asset.id;
  });

  afterAll(async () => {
    // FK-safe 역순 정리
    await prisma.asset.deleteMany({ where: { substationId: subId } }).catch(() => {});
    await prisma.substation.delete({ where: { id: subId } }).catch(() => {});
    await prisma.branch.delete({ where: { id: brId } }).catch(() => {});
    await prisma.headquarters.delete({ where: { id: hqId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('주어진 ids 의 AssetRef 반환(name/substationName 포함), 없는 id 는 제외', async () => {
    const res = await request(app).post('/api/assets/refs').set('Authorization', `Bearer ${token}`)
      .send({ ids: [assetId, 'nonexistent-id'] });
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.data.map((r: { id: string }) => [r.id, r]));
    expect(byId[assetId]).toMatchObject({ id: assetId, name: expect.any(String), substationId: subId, substationName: '__refs_sub__' });
    expect(byId['nonexistent-id']).toBeUndefined();
  });

  it('비인증 401', async () => {
    const res = await request(app).post('/api/assets/refs').send({ ids: [] });
    expect(res.status).toBe(401);
  });
});
