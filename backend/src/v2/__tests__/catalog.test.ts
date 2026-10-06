import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { authHeader, ensureTestMaster, makeApp, makeOrg, sweepTestFixtures, type TestMaster } from './helpers.js';

const app = makeApp();
const admin = { Authorization: authHeader('admin') };
const viewer = { Authorization: authHeader('viewer') };
let m: TestMaster;

beforeAll(async () => { await sweepTestFixtures(); m = await ensureTestMaster(); });
afterAll(async () => { await sweepTestFixtures(); await nextDb.$disconnect(); });

describe('카탈로그', () => {
  it('GET 은 네 목록과 매체 어휘를 준다', async () => {
    const body = (await request(app).get('/api/v2/catalog').set(viewer).expect(200)).body;
    expect(body.media.map((x: { key: string }) => x.key)).toEqual(['power', 'comm', 'ground', 'fiber']);
    expect(body.equipmentTypes.some((t: { id: string }) => t.id === m.equipmentTypeId)).toBe(true);
    expect(body.rackTypes.some((t: { id: string }) => t.id === m.rackTypeId)).toBe(true);
    expect(body.cableTypes.some((t: { id: string }) => t.id === m.fiberCableId)).toBe(true);
  });

  it('설비 종류를 만들고 고치고 지운다 — key 는 바꿀 수 없다', async () => {
    const created = (await request(app).post('/api/v2/catalog/equipment-types').set(admin)
      .send({ key: 'TEST_NEW', name: '새 종류', categoryId: m.categoryId, sortOrder: 9, installManDays: 1 }).expect(201)).body;
    const patched = (await request(app).patch(`/api/v2/catalog/equipment-types/${created.id}`).set(admin)
      .send({ name: '고친 종류', key: 'TEST_OTHER' }).expect(200)).body;
    expect(patched.name).toBe('고친 종류');
    expect(patched.key).toBe('TEST_NEW');
    await request(app).delete(`/api/v2/catalog/equipment-types/${created.id}`).set(admin).expect(204);
  });

  it('key 가 겹치면 409 KEY_TAKEN', async () => {
    const res = await request(app).post('/api/v2/catalog/rack-types').set(admin).send({ key: 'TEST_RACK', name: '겹침' }).expect(409);
    expect(res.body.error).toBe('KEY_TAKEN');
  });

  it('케이블 종류의 매체는 어휘 밖이면 400', async () => {
    await request(app).post('/api/v2/catalog/cable-types').set(admin).send({ key: 'TEST_BAD', name: '나쁨', medium: 'network' }).expect(400);
  });

  it('쓰이는 종류는 지울 수 없다 — 409 TYPE_IN_USE', async () => {
    const org = await makeOrg('t3-cat');
    const rack = await nextDb.rack.create({ data: { substationId: org.s1, name: '랙', rackTypeId: m.rackTypeId } });
    await nextDb.equipment.create({ data: { substationId: org.s1, rackId: rack.id, name: '설비', typeId: m.equipmentTypeId } });
    const res = await request(app).delete(`/api/v2/catalog/equipment-types/${m.equipmentTypeId}`).set(admin).expect(409);
    expect(res.body.error).toBe('TYPE_IN_USE');
    const res2 = await request(app).delete(`/api/v2/catalog/rack-types/${m.rackTypeId}`).set(admin).expect(409);
    expect(res2.body.error).toBe('TYPE_IN_USE');
  });

  it('관리자가 아니면 쓰기 403', async () => {
    await request(app).post('/api/v2/catalog/categories').set(viewer).send({ key: 'TEST_X', name: 'x' }).expect(403);
  });

  it('없는 id 는 404', async () => {
    await request(app).patch(`/api/v2/catalog/rack-types/${randomUUID()}`).set(admin).send({ name: 'x' }).expect(404);
  });
});
