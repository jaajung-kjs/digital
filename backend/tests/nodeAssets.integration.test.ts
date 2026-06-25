import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { nodesRouter } from '../src/routes/nodes.routes.js';
import { authRouter } from '../src/routes/auth.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import prisma from '../src/config/prisma.js';

describe('노드범위 자산 리스트 GET /api/nodes/:id/assets', () => {
  let app: Express; let token: string;
  let hqId: string, brId: string, subId: string, sub2Id: string, typeId: string;
  let assetId: string, asset2Id: string;
  beforeAll(async () => {
    app = express(); app.use(express.json());
    app.use('/api/auth', authRouter); app.use('/api/nodes', nodesRouter); app.use(errorHandler);
    token = (await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' })).body.accessToken;

    const hq = await prisma.headquarters.create({ data: { name: '__na_hq__' } }); hqId = hq.id;
    const br = await prisma.branch.create({ data: { name: '__na_br__', headquartersId: hq.id } }); brId = br.id;
    const sub = await prisma.substation.create({ data: { name: '__na_sub__', branchId: br.id } }); subId = sub.id;
    const sub2 = await prisma.substation.create({ data: { name: '__na_sub2__', branchId: br.id } }); sub2Id = sub2.id;
    typeId = (await prisma.assetType.findFirstOrThrow({ where: { role: 'device' } })).id;

    const a = await prisma.asset.create({
      data: { substationId: subId, assetTypeId: typeId, name: 'NA-1', installDate: new Date('2024-01-15'), manager: '홍길동' },
    });
    assetId = a.id;
    // lastMaintenanceDate 는 이제 InspectionLog(점검) 의 가장 최근 inspectionDate 에서 파생.
    await prisma.inspectionLog.create({
      data: { assetId: a.id, inspectionDate: new Date('2025-03-01'), inspector: '홍길동', content: '정기점검' },
    });
    const a2 = await prisma.asset.create({ data: { substationId: sub2Id, assetTypeId: typeId, name: 'NA-2' } });
    asset2Id = a2.id;
  });
  afterAll(async () => {
    await prisma.inspectionLog.deleteMany({ where: { assetId: { in: [assetId, asset2Id] } } });
    await prisma.asset.deleteMany({ where: { id: { in: [assetId, asset2Id] } } });
    await prisma.substation.deleteMany({ where: { id: { in: [subId, sub2Id] } } }).catch(() => {});
    await prisma.branch.delete({ where: { id: brId } }).catch(() => {});
    await prisma.headquarters.delete({ where: { id: hqId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('substation 스코프 — 변전소 자산 + 설치장소·마지막점검일', async () => {
    const res = await request(app)
      .get(`/api/nodes/${subId}/assets?nodeType=substation`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    const item = res.body.data.find((x: { id: string }) => x.id === assetId);
    expect(item).toBeTruthy();
    expect(typeof item.substationName).toBe('string');
    expect(typeof item.assetTypeName).toBe('string');
    expect('installDate' in item).toBe(true);
    expect('manager' in item).toBe(true);
    expect('lastMaintenanceDate' in item).toBe(true);
    expect(item.lastMaintenanceDate).not.toBeNull();
  });

  it('branch 스코프 — 지사 산하 변전소들의 자산', async () => {
    const res = await request(app)
      .get(`/api/nodes/${brId}/assets?nodeType=branch`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const ids = res.body.data.map((x: { id: string }) => x.id);
    expect(ids).toContain(assetId);
    expect(ids).toContain(asset2Id);
  });

  it('잘못된 nodeType → 400', async () => {
    await request(app)
      .get(`/api/nodes/${subId}/assets?nodeType=bogus`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('인증 없으면 401', async () => {
    await request(app)
      .get(`/api/nodes/${subId}/assets?nodeType=substation`)
      .expect(401);
  });
});
