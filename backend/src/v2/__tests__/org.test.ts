import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { authHeader, makeApp } from './helpers.js';

const app = makeApp();
const uniq = `t2a-org-${Date.now()}`;
const admin = { Authorization: authHeader('ADMIN') };

describe('org CRUD + tree', () => {
  let hqId: string, brId: string, subId: string, floorId: string;

  afterAll(async () => {
    // 자식부터 정리 (실패해도 무시 — 테스트 중 이미 삭제된 경우)
    await nextDb.floor.deleteMany({ where: { name: { startsWith: uniq } } });
    await nextDb.substation.deleteMany({ where: { name: { startsWith: uniq } } });
    await nextDb.branch.deleteMany({ where: { name: { startsWith: uniq } } });
    await nextDb.headquarters.deleteMany({ where: { name: { startsWith: uniq } } });
    await nextDb.$disconnect();
  });

  it('계층 생성 → 트리 반영', async () => {
    hqId = (await request(app).post('/api/v2/org/headquarters').set(admin).send({ name: `${uniq}-hq` }).expect(201)).body.id;
    brId = (await request(app).post('/api/v2/org/branches').set(admin).send({ headquartersId: hqId, name: `${uniq}-br` }).expect(201)).body.id;
    subId = (await request(app).post('/api/v2/org/substations').set(admin).send({ branchId: brId, name: `${uniq}-ss` }).expect(201)).body.id;
    floorId = (await request(app).post('/api/v2/org/floors').set(admin).send({ substationId: subId, name: `${uniq}-1층` }).expect(201)).body.id;

    const tree = (await request(app).get('/api/v2/org-tree').set(admin).expect(200)).body;
    const hq = tree.headquarters.find((h: { id: string }) => h.id === hqId);
    expect(hq.branches[0].substations[0].floors[0].id).toBe(floorId);
  });

  it('VIEWER 쓰기 → 403', async () => {
    await request(app)
      .post('/api/v2/org/headquarters')
      .set('Authorization', authHeader('VIEWER'))
      .send({ name: `${uniq}-x` })
      .expect(403);
  });

  it('이름 변경 PATCH', async () => {
    await request(app).patch(`/api/v2/org/substations/${subId}`).set(admin).send({ name: `${uniq}-ss2` }).expect(200);
    const row = await nextDb.substation.findUnique({ where: { id: subId } });
    expect(row!.name).toBe(`${uniq}-ss2`);
  });

  it('PATCH 비-UUID id → 400', async () => {
    await request(app).patch('/api/v2/org/substations/not-a-uuid').set(admin).send({ name: `${uniq}-x` }).expect(400);
  });

  it('PATCH 빈 객체 → 400', async () => {
    await request(app).patch(`/api/v2/org/substations/${subId}`).set(admin).send({}).expect(400);
  });

  it('자식 있는 노드 삭제 → 409, 리프 삭제 → 200', async () => {
    await request(app).delete(`/api/v2/org/substations/${subId}`).set(admin).expect(409);
    await request(app).delete(`/api/v2/org/floors/${floorId}`).set(admin).expect(200);
    await request(app).delete(`/api/v2/org/substations/${subId}`).set(admin).expect(200);
  });

  it('빈 이름 → 400', async () => {
    await request(app).post('/api/v2/org/headquarters').set(admin).send({ name: '' }).expect(400);
  });
});
