import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { authHeader, makeApp, sweepTestFixtures } from './helpers.js';

const app = makeApp();
const uniq = `t2a-smoke-${Date.now()}`;
const admin = { Authorization: authHeader('ADMIN') };

beforeAll(async () => {
  await sweepTestFixtures();
});

afterAll(async () => {
  await sweepTestFixtures();
  await nextDb.$disconnect();
});

describe('v2 전체 흐름 스모크', () => {
  it('조직 생성 → 커밋 → 워킹카피 → 노드 피드 → 삭제', async () => {
    const hqId = (await request(app).post('/api/v2/org/headquarters').set(admin).send({ name: `${uniq}-hq` }).expect(201)).body.id;
    const brId = (await request(app).post('/api/v2/org/branches').set(admin).send({ headquartersId: hqId, name: `${uniq}-br` }).expect(201)).body.id;
    const subId = (await request(app).post('/api/v2/org/substations').set(admin).send({ branchId: brId, name: `${uniq}-ss` }).expect(201)).body.id;
    const floorId = (await request(app).post('/api/v2/org/floors').set(admin).send({ substationId: subId, name: `${uniq}-1층` }).expect(201)).body.id;

    const catalog = (await request(app).get('/api/v2/catalog').set(admin).expect(200)).body;
    const typeId = (key: string) => catalog.types.find((t: { key: string }) => t.key === key).id;

    const rackId = randomUUID();
    const moduleId = randomUUID();
    await request(app)
      .put(`/api/v2/substations/${subId}/commit`)
      .set(admin)
      .send({
        assets: {
          creates: [
            { id: rackId, name: `${uniq}-rack`, typeId: typeId('RACK'), floorId, x: 0, y: 0, width: 60, height: 80 },
            { id: moduleId, name: `${uniq}-pitr`, typeId: typeId('PITR-5000'), parentAssetId: rackId, containerKey: 'main', slotIndex: 0, slotSpan: 2 },
          ],
        },
        records: {
          maintenance: { creates: [{ id: randomUUID(), assetId: moduleId, occurredAt: '2026-07-20T00:00:00.000Z', content: '신설' }] },
        },
      })
      .expect(200);

    const wc = (await request(app).get(`/api/v2/substations/${subId}/workingcopy`).set(admin).expect(200)).body;
    expect(wc.assets).toHaveLength(2);
    expect(wc.maintenanceLogs).toHaveLength(1);
    const mod = wc.assets.find((a: { id: string }) => a.id === moduleId);
    expect(mod.ports.length).toBeGreaterThan(0);

    const feed = (await request(app).get(`/api/v2/nodes/${hqId}/assets`).set(admin).expect(200)).body;
    expect(feed.map((r: { id: string }) => r.id).sort()).toEqual([rackId, moduleId].sort());

    const bv = Object.fromEntries(wc.assets.map((a: { id: string; updatedAt: string }) => [a.id, a.updatedAt]));
    await request(app)
      .put(`/api/v2/substations/${subId}/commit`)
      .set(admin)
      .send({ assets: { deletes: [rackId, moduleId] }, baseVersions: bv })
      .expect(200);
    expect((await request(app).get(`/api/v2/substations/${subId}/workingcopy`).set(admin).expect(200)).body.assets).toHaveLength(0);
  });
});
