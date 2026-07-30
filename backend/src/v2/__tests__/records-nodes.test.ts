import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { authHeader, makeApp, sweepTestFixtures } from './helpers.js';

const app = makeApp();
const uniq = `t2a-rn-${Date.now()}`;
const admin = { Authorization: authHeader('admin') };
let hqId: string, brId: string, subId: string, sub2Id: string, a1Id: string;

beforeAll(async () => {
  await sweepTestFixtures();
  const hq = await nextDb.headquarters.create({ data: { name: `${uniq}-hq` } });
  hqId = hq.id;
  const br = await nextDb.branch.create({ data: { name: `${uniq}-br`, headquartersId: hq.id } });
  brId = br.id;
  const s1 = await nextDb.substation.create({ data: { name: `${uniq}-ss1`, branchId: br.id } });
  const s2 = await nextDb.substation.create({ data: { name: `${uniq}-ss2`, branchId: br.id } });
  subId = s1.id;
  sub2Id = s2.id;
  const t = await nextDb.assetType.findUniqueOrThrow({ where: { key: 'GROUNDING' } });
  a1Id = (await nextDb.asset.create({ data: { name: `${uniq}-a1`, typeId: t.id, substationId: s1.id } })).id;
  await nextDb.asset.create({ data: { name: `${uniq}-a2`, typeId: t.id, substationId: s2.id } });
});

afterAll(async () => {
  await sweepTestFixtures();
  await nextDb.$disconnect();
});

describe('records in commit', () => {
  it('신규 자산 + 그 자산의 이력을 한 커밋으로', async () => {
    const newAssetId = randomUUID();
    const logId = randomUUID();
    const t = await nextDb.assetType.findUniqueOrThrow({ where: { key: 'HVAC' } });
    await request(app)
      .put(`/api/v2/substations/${subId}/commit`)
      .set(admin)
      .send({
        assets: { creates: [{ id: newAssetId, name: `${uniq}-hvac`, typeId: t.id }] },
        records: {
          maintenance: { creates: [{ id: logId, assetId: newAssetId, occurredAt: '2026-07-10T00:00:00.000Z', content: '설치 점검' }] },
        },
      })
      .expect(200);
    expect(await nextDb.maintenanceLog.count({ where: { assetId: newAssetId } })).toBe(1);
  });

  it('타 변전소 자산에 레코드 → 422', async () => {
    const other = await nextDb.asset.findFirstOrThrow({ where: { substationId: sub2Id } });
    await request(app)
      .put(`/api/v2/substations/${subId}/commit`)
      .set(admin)
      .send({
        records: { maintenance: { creates: [{ id: randomUUID(), assetId: other.id, occurredAt: '2026-07-10T00:00:00.000Z', content: 'x' }] } },
      })
      .expect(422);
  });

  it('레코드 update/delete', async () => {
    const log = await nextDb.maintenanceLog.findFirstOrThrow({ where: { asset: { substationId: subId } } });
    await request(app)
      .put(`/api/v2/substations/${subId}/commit`)
      .set(admin)
      .send({ records: { maintenance: { updates: [{ id: log.id, patch: { content: '수정됨' } }] } } })
      .expect(200);
    expect((await nextDb.maintenanceLog.findUniqueOrThrow({ where: { id: log.id } })).content).toBe('수정됨');
    await request(app)
      .put(`/api/v2/substations/${subId}/commit`)
      .set(admin)
      .send({ records: { maintenance: { deletes: [log.id] } } })
      .expect(200);
    expect(await nextDb.maintenanceLog.count({ where: { id: log.id } })).toBe(0);
  });

  it('inspections create → update → delete 라운드트립', async () => {
    const insId = randomUUID();
    await request(app)
      .put(`/api/v2/substations/${subId}/commit`)
      .set(admin)
      .send({
        records: {
          inspections: { creates: [{ id: insId, assetId: a1Id, inspectedAt: '2026-07-11T00:00:00.000Z', content: '정기 점검' }] },
        },
      })
      .expect(200);
    const created = await nextDb.inspectionLog.findUniqueOrThrow({ where: { id: insId } });
    expect(created.content).toBe('정기 점검');
    expect(created.result).toBeNull();

    await request(app)
      .put(`/api/v2/substations/${subId}/commit`)
      .set(admin)
      .send({ records: { inspections: { updates: [{ id: insId, patch: { result: '양호' } }] } } })
      .expect(200);
    expect((await nextDb.inspectionLog.findUniqueOrThrow({ where: { id: insId } })).result).toBe('양호');

    await request(app)
      .put(`/api/v2/substations/${subId}/commit`)
      .set(admin)
      .send({ records: { inspections: { deletes: [insId] } } })
      .expect(200);
    expect(await nextDb.inspectionLog.count({ where: { id: insId } })).toBe(0);
  });

  it('타 변전소 자산에 inspection create → 422', async () => {
    const other = await nextDb.asset.findFirstOrThrow({ where: { substationId: sub2Id } });
    await request(app)
      .put(`/api/v2/substations/${subId}/commit`)
      .set(admin)
      .send({
        records: { inspections: { creates: [{ id: randomUUID(), assetId: other.id, inspectedAt: '2026-07-11T00:00:00.000Z', content: 'x' }] } },
      })
      .expect(422);
  });
});

describe('GET /api/v2/nodes/:id/assets', () => {
  it('본부 스코프: 두 변전소 자산 모두', async () => {
    const rows = (await request(app).get(`/api/v2/nodes/${hqId}/assets`).set(admin).expect(200)).body;
    const names = rows.map((r: { name: string }) => r.name);
    expect(names).toContain(`${uniq}-a1`);
    expect(names).toContain(`${uniq}-a2`);
    expect(rows[0]).toHaveProperty('substationName');
    expect(rows[0]).toHaveProperty('typeName');
  });

  it('지사 스코프: 산하 두 변전소 자산 모두', async () => {
    const rows = (await request(app).get(`/api/v2/nodes/${brId}/assets`).set(admin).expect(200)).body;
    const names = rows.map((r: { name: string }) => r.name);
    expect(names).toContain(`${uniq}-a1`);
    expect(names).toContain(`${uniq}-a2`);
  });

  it('변전소 스코프: 해당 변전소만', async () => {
    const rows = (await request(app).get(`/api/v2/nodes/${sub2Id}/assets`).set(admin).expect(200)).body;
    expect(rows.every((r: { substationId: string }) => r.substationId === sub2Id)).toBe(true);
  });

  it('미존재 노드 → 404', async () => {
    await request(app).get(`/api/v2/nodes/${randomUUID()}/assets`).set(admin).expect(404);
  });
});
