import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { assetsRouter } from '../src/routes/assets.routes.js';
import { inspectionLogsRouter } from '../src/routes/inspectionLogs.routes.js';
import { authRouter } from '../src/routes/auth.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import prisma from '../src/config/prisma.js';

describe('점검 이력(InspectionLog) CRUD + lastMaintenanceDate 파생', () => {
  let app: Express;
  let adminToken: string;
  let hqId: string, branchId: string, substationId: string, typeId: string, assetId: string;
  let logId: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    app.use('/api/assets', assetsRouter);
    app.use('/api/inspection-logs', inspectionLogsRouter);
    app.use(errorHandler);

    adminToken = (await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' })).body.accessToken;

    const hq = await prisma.headquarters.create({ data: { name: '__insp_hq__' } }); hqId = hq.id;
    const br = await prisma.branch.create({ data: { name: '__insp_br__', headquartersId: hq.id } }); branchId = br.id;
    const sub = await prisma.substation.create({ data: { name: '__insp_sub__', branchId: br.id } }); substationId = sub.id;
    typeId = (await prisma.assetType.findFirstOrThrow({ where: { placementKind: null, isActive: true } })).id;
    const a = await prisma.asset.create({ data: { substationId, assetTypeId: typeId, name: 'INSP-1' } });
    assetId = a.id;
  });

  afterAll(async () => {
    await prisma.inspectionLog.deleteMany({ where: { assetId } });
    await prisma.asset.deleteMany({ where: { id: assetId } });
    await prisma.substation.delete({ where: { id: substationId } }).catch(() => {});
    await prisma.branch.delete({ where: { id: branchId } }).catch(() => {});
    await prisma.headquarters.delete({ where: { id: hqId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('POST /api/assets/:assetId/inspections 는 점검 이력을 생성', async () => {
    const res = await request(app)
      .post(`/api/assets/${assetId}/inspections`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ inspectionDate: '2025-03-01', inspector: '홍길동', content: '정기점검 양호' })
      .expect(201);
    expect(res.body.data.inspector).toBe('홍길동');
    expect(res.body.data.inspectionDate.slice(0, 10)).toBe('2025-03-01');
    logId = res.body.data.id;
  });

  it('POST 는 inspector 누락 시 400', async () => {
    await request(app)
      .post(`/api/assets/${assetId}/inspections`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ inspectionDate: '2025-03-01' })
      .expect(400);
  });

  it('GET /api/assets/:assetId/inspections 는 최근 점검일 순으로 반환', async () => {
    await request(app)
      .post(`/api/assets/${assetId}/inspections`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ inspectionDate: '2025-06-15', inspector: '김철수' })
      .expect(201);
    const res = await request(app)
      .get(`/api/assets/${assetId}/inspections`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.data.length).toBe(2);
    // 가장 최근(2025-06-15) 이 첫 항목 — lastMaintenanceDate 파생 근거.
    expect(res.body.data[0].inspectionDate.slice(0, 10)).toBe('2025-06-15');
  });

  it('PUT /api/inspection-logs/:id 는 점검 이력을 수정', async () => {
    const res = await request(app)
      .put(`/api/inspection-logs/${logId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ inspector: '이영희', content: '수정됨' })
      .expect(200);
    expect(res.body.data.inspector).toBe('이영희');
    expect(res.body.data.content).toBe('수정됨');
  });

  it('DELETE /api/inspection-logs/:id 는 점검 이력을 삭제', async () => {
    await request(app)
      .delete(`/api/inspection-logs/${logId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const res = await request(app)
      .get(`/api/assets/${assetId}/inspections`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.data.find((l: { id: string }) => l.id === logId)).toBeUndefined();
  });

  it('인증 없이 생성 시 401', async () => {
    await request(app)
      .post(`/api/assets/${assetId}/inspections`)
      .send({ inspectionDate: '2025-03-01', inspector: 'x' })
      .expect(401);
  });
});
