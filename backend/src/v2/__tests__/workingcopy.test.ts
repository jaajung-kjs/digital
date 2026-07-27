import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { authHeader, makeApp } from './helpers.js';

const app = makeApp();
const uniq = `t2a-wc-${Date.now()}`;
const admin = { Authorization: authHeader('ADMIN') };
let subId: string, floorId: string, assetId: string;

beforeAll(async () => {
  const hq = await nextDb.headquarters.create({ data: { name: `${uniq}-hq` } });
  const br = await nextDb.branch.create({ data: { name: `${uniq}-br`, headquartersId: hq.id } });
  const sub = await nextDb.substation.create({ data: { name: `${uniq}-ss`, branchId: br.id } });
  const floor = await nextDb.floor.create({ data: { name: `${uniq}-1층`, substationId: sub.id } });
  subId = sub.id;
  floorId = floor.id;
  const rackType = await nextDb.assetType.findUniqueOrThrow({ where: { key: 'RACK' } });
  const asset = await nextDb.asset.create({
    data: { name: `${uniq}-rack`, typeId: rackType.id, substationId: sub.id, floorId: floor.id, x: 10, y: 20, width: 60, height: 80 },
  });
  assetId = asset.id;
  await nextDb.maintenanceLog.create({ data: { assetId: asset.id, occurredAt: new Date('2026-07-01'), content: '테스트 고장' } });
});

afterAll(async () => {
  await nextDb.asset.deleteMany({ where: { name: { startsWith: uniq } } });
  await nextDb.floor.deleteMany({ where: { name: { startsWith: uniq } } });
  await nextDb.substation.deleteMany({ where: { name: { startsWith: uniq } } });
  await nextDb.branch.deleteMany({ where: { name: { startsWith: uniq } } });
  await nextDb.headquarters.deleteMany({ where: { name: { startsWith: uniq } } });
  await nextDb.$disconnect();
});

describe('GET /api/v2/substations/:id/workingcopy', () => {
  it('컬렉션 전체를 평탄하게 반환한다', async () => {
    const res = await request(app).get(`/api/v2/substations/${subId}/workingcopy`).set(admin).expect(200);
    expect(res.body.substation.id).toBe(subId);
    expect(res.body.floors.map((f: { id: string }) => f.id)).toEqual([floorId]);
    const asset = res.body.assets.find((a: { id: string }) => a.id === assetId);
    expect(asset).toMatchObject({ floorId, x: 10, y: 20 });
    expect(typeof asset.updatedAt).toBe('string');
    expect(res.body.maintenanceLogs).toHaveLength(1);
    expect(res.body.inspectionLogs).toEqual([]);
  });

  it('없는 변전소 → 404', async () => {
    await request(app)
      .get('/api/v2/substations/00000000-0000-0000-0000-000000000000/workingcopy')
      .set(admin)
      .expect(404);
  });
});
