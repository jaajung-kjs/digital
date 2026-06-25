import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { authRouter } from '../src/routes/auth.routes.js';
import { floorsRouter } from '../src/routes/floors.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import prisma from '../src/config/prisma.js';

/**
 * #3 Task 3 — 작업지시서 아카이브 + 이력 (floors/:id/work-orders).
 *
 * 커밋 후 프론트가 계산한 설계서를 AuditLog(action='WORK_ORDER') 로 아카이브하고,
 * 목록/상세로 조회한다. 핵심:
 *  - POST 201 → AuditLog work-order 행 1개 생성(entityType='Floor').
 *  - GET 목록 → 메타데이터(일시·작성자·요약).
 *  - GET 상세 → 아카이브된 ConstructionReport 전체.
 *  - 인증/관리자 게이팅 + 잘못된 floor 404.
 */
describe('작업지시서 아카이브 (floors/:id/work-orders)', () => {
  let app: Express;
  let token: string;
  let userId: string;
  let hqId: string, brId: string, subId: string, floorId: string;

  const report = {
    diff: [{ type: 'asset', action: 'install', materialCategoryCode: 'EQP-RACK' }],
    bom: [{ materialCategoryCode: 'EQP-RACK', name: '랙', quantity: 1, unit: '식' }],
    labor: [{ workName: '랙 설치', laborType: '통신내선공', hours: 2 }],
    totalLaborHours: 2,
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    app.use('/api/floors', floorsRouter);
    app.use(errorHandler);

    const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    token = login.body.accessToken;
    userId = (await prisma.user.findFirstOrThrow({ where: { username: 'admin' } })).id;

    const hq = await prisma.headquarters.create({ data: { name: '__wo_hq__' } }); hqId = hq.id;
    const br = await prisma.branch.create({ data: { name: '__wo_br__', headquartersId: hq.id } }); brId = br.id;
    const sub = await prisma.substation.create({ data: { name: '__wo_sub__', branchId: br.id } }); subId = sub.id;
    const floor = await prisma.floor.create({ data: { substationId: subId, name: '__wo_floor__', createdById: userId, updatedById: userId } });
    floorId = floor.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityType: 'Floor', entityId: floorId } }).catch(() => {});
    await prisma.floor.delete({ where: { id: floorId } }).catch(() => {});
    await prisma.substation.delete({ where: { id: subId } }).catch(() => {});
    await prisma.branch.delete({ where: { id: brId } }).catch(() => {});
    await prisma.headquarters.delete({ where: { id: hqId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('201 — 아카이브 → 목록 → 상세 라운드트립', async () => {
    const create = await request(app)
      .post(`/api/floors/${floorId}/work-orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({ report, summary: { itemCount: 1 } })
      .expect(201);

    const woId = create.body.data.id as string;
    expect(woId).toBeTruthy();
    expect(create.body.data.summary).toEqual({ itemCount: 1 });

    // AuditLog work-order 행 1개 생성 확인
    const rows = await prisma.auditLog.count({
      where: { entityType: 'Floor', entityId: floorId, action: 'WORK_ORDER' },
    });
    expect(rows).toBe(1);

    // 목록 — 메타데이터
    const list = await request(app).get(`/api/floors/${floorId}/work-orders`).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].id).toBe(woId);
    expect(list.body.data[0].summary).toEqual({ itemCount: 1 });

    // 상세 — 설계서 전체
    const detail = await request(app).get(`/api/floors/${floorId}/work-orders/${woId}`).expect(200);
    expect(detail.body.data.constructionReport).toEqual(report);
    expect(detail.body.data.summary).toEqual({ itemCount: 1 });
  });

  it('인증 없음 → 401', async () => {
    await request(app)
      .post(`/api/floors/${floorId}/work-orders`)
      .send({ report })
      .expect(401);
  });

  it('404 — 존재하지 않는 floor', async () => {
    await request(app)
      .post(`/api/floors/00000000-0000-0000-0000-000000000000/work-orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({ report })
      .expect(404);
  });
});
