import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { authRouter } from '../src/routes/auth.routes.js';
import { assetsRouter } from '../src/routes/assets.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import prisma from '../src/config/prisma.js';

describe('POST /api/assets/search', () => {
  let app: Express;
  let token: string;

  // 테스트 전용 조직 트리 id
  let hqId: string, brId: string, subId: string;
  // assetType (ofd 역할)
  let ofdTypeId: string;
  // 자산
  let ofdId: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    app.use('/api/assets', assetsRouter);
    app.use(errorHandler);

    // 로그인 (trace.integration.test 와 동일 방식)
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    token = login.body.accessToken;

    // 조직 트리
    const hq = await prisma.headquarters.create({ data: { name: '__as_hq__' } });
    hqId = hq.id;
    const br = await prisma.branch.create({ data: { name: '__as_br__', headquartersId: hqId } });
    brId = br.id;
    const sub = await prisma.substation.create({ data: { name: '__as_sub__', branchId: brId } });
    subId = sub.id;

    // AssetType (ofd 역할) — 기존 시드에서 찾는다. 없으면 생성.
    const existing = await prisma.assetType.findFirst({ where: { role: 'ofd' } });
    if (existing) {
      ofdTypeId = existing.id;
    } else {
      const created = await prisma.assetType.create({ data: { name: '__as_ofd_type__', role: 'ofd' } });
      ofdTypeId = created.id;
    }

    // OFD 자산 1개 생성
    const ofd = await prisma.asset.create({
      data: { substationId: subId, assetTypeId: ofdTypeId, name: '__as_ofd__' },
    });
    ofdId = ofd.id;
  });

  afterAll(async () => {
    // FK-safe 역순 정리
    await prisma.asset.deleteMany({ where: { substationId: subId } }).catch(() => {});
    await prisma.substation.delete({ where: { id: subId } }).catch(() => {});
    await prisma.branch.delete({ where: { id: brId } }).catch(() => {});
    await prisma.headquarters.delete({ where: { id: hqId } }).catch(() => {});
    // ofdTypeId 가 시드에서 온 경우 삭제하지 않는다
    await prisma.$disconnect();
  });

  it('role 필터로 committed OFD 반환', async () => {
    const res = await request(app)
      .post('/api/assets/search')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'ofd' });

    expect(res.status).toBe(200);
    expect(res.body.data.some((a: { id: string }) => a.id === ofdId)).toBe(true);
  });

  it('overlay.creates 가 결과에 머지(미저장 OFD)', async () => {
    const res = await request(app)
      .post('/api/assets/search')
      .set('Authorization', `Bearer ${token}`)
      .send({
        role: 'ofd',
        overlay: {
          creates: [
            { id: 'tmp-ofd', name: '미저장OFD', role: 'ofd', substationId: subId, substationName: '테스트변전소' },
          ],
          updates: [],
          deletes: [],
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.some((a: { id: string }) => a.id === 'tmp-ofd')).toBe(true);
  });

  it('비인증 401', async () => {
    const res = await request(app)
      .post('/api/assets/search')
      .send({ role: 'ofd' });

    expect(res.status).toBe(401);
  });
});
