import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { authHeader, ensureTestMaster, makeApp, makeOrg, sweepTestFixtures, type TestMaster } from './helpers.js';

const app = makeApp();
const admin = { Authorization: authHeader('admin') };
let m: TestMaster;
let org: Awaited<ReturnType<typeof makeOrg>>;
let s3: string; // 범위 밖 국(다른 지사)
let s4: string; // 두 번 건너 닿는 범위 밖 국
const ids = { r1: randomUUID(), r3: randomUUID(), r4: randomUUID(), d1: randomUUID(), d3: randomUUID(), d4: randomUUID(), pnl: randomUUID(),
  inL: randomUUID(), outL: randomUUID(), farL: randomUUID(), idleL: randomUUID(), jumpL: randomUUID() };

beforeAll(async () => {
  await sweepTestFixtures();
  m = await ensureTestMaster();
  org = await makeOrg('t3-net');
  const br2 = await nextDb.branch.create({ data: { name: 't3-net-br2', headquartersId: org.hqId } });
  s3 = (await nextDb.substation.create({ data: { name: 't3-net-S3', branchId: br2.id } })).id;
  s4 = (await nextDb.substation.create({ data: { name: 't3-net-S4', branchId: br2.id } })).id;
  await request(app).put('/api/v2/commit').set(admin).send({
    racks: { creates: [
      { id: ids.r1, substationId: org.s1, name: '랙1', rackTypeId: m.rackTypeId },
      { id: ids.r3, substationId: s3, name: '랙3', rackTypeId: m.rackTypeId },
      { id: ids.r4, substationId: s4, name: '랙4', rackTypeId: m.rackTypeId },
    ] },
    equipment: { creates: [
      { id: ids.pnl, substationId: org.s1, rackId: ids.r1, name: '분전반', typeId: m.equipmentTypeId, circuitCount: 1 },
      { id: ids.d1, substationId: org.s1, rackId: ids.r1, name: '송광치', typeId: m.equipmentTypeId },
      { id: ids.d3, substationId: s3, rackId: ids.r3, name: '북춘천', typeId: m.equipmentTypeId },
      { id: ids.d4, substationId: s4, rackId: ids.r4, name: '먼국', typeId: m.equipmentTypeId },
    ] },
    fiberLines: { creates: [
      { id: ids.inL, cableTypeId: m.fiberCableId, coreCount: 2, name: '범위선로', a: { substationId: org.s1 }, b: { substationId: s3 } },
      { id: ids.outL, cableTypeId: m.fiberCableId, coreCount: 2, name: '밖선로', a: { substationId: s3 }, b: { substationId: s4, equipmentId: ids.d4, panel: 1 } },
      { id: ids.farL, cableTypeId: m.fiberCableId, coreCount: 2, name: '더밖선로', a: { substationId: s4 }, b: { substationId: s4 } },
      { id: ids.idleL, cableTypeId: m.fiberCableId, coreCount: 2, name: '무관선로', a: { substationId: s3 }, b: { substationId: s4 } },
    ] },
    links: { creates: [
      { id: randomUUID(), substationId: org.s1, cableTypeId: m.powerCableId, a: { kind: 'circuit', equipmentId: ids.pnl, no: 1 }, b: { kind: 'equipment', equipmentId: ids.d1 } },
      { id: randomUUID(), substationId: org.s1, cableTypeId: m.commCableId, a: { kind: 'core', lineId: ids.inL, no: 1, side: 'A' }, b: { kind: 'equipment', equipmentId: ids.d1, label: 'WEST' } },
      { id: randomUUID(), substationId: s3, cableTypeId: m.commCableId, a: { kind: 'core', lineId: ids.inL, no: 1, side: 'B' }, b: { kind: 'equipment', equipmentId: ids.d3 } },
      { id: randomUUID(), substationId: s3, cableTypeId: m.commCableId, a: { kind: 'core', lineId: ids.inL, no: 2, side: 'B' }, b: { kind: 'core', lineId: ids.outL, no: 1, side: 'A' } },
      { id: randomUUID(), substationId: s4, cableTypeId: m.commCableId, a: { kind: 'core', lineId: ids.outL, no: 1, side: 'B' }, b: { kind: 'core', lineId: ids.farL, no: 1, side: 'A' } },
    ] },
  }).expect(200);
});
afterAll(async () => { await sweepTestFixtures(); await nextDb.$disconnect(); });

const get = (id: string) => request(app).get(`/api/v2/nodes/${id}/network`).set(admin);

describe('GET /nodes/:id/network', () => {
  it('지사 범위 — 응답 모양과 정렬', async () => {
    const b = (await get(org.branchId).expect(200)).body;
    expect(Object.keys(b).sort()).toEqual(['cores', 'equipment', 'lines', 'links', 'substations']);
    expect(Object.keys(b.lines[0]).sort()).toEqual(['aEquipmentId', 'aPanel', 'aStartNo', 'aSubstationId', 'bEquipmentId', 'bPanel', 'bStartNo', 'bSubstationId', 'cableTypeId', 'coreCount', 'id', 'lengthKm', 'name']);
    expect(Object.keys(b.links[0]).sort()).toEqual(['a', 'b', 'id', 'substationId']);
    expect(Object.keys(b.cores[0]).sort()).toEqual(['lineId', 'no', 'role', 'status']);
    expect(Object.keys(b.equipment[0]).sort()).toEqual(['id', 'name', 'substationId', 'typeName']);
    const sorted = (a: { id: string }[]) => a.map((x) => x.id).join() === [...a].sort((x, y) => (x.id < y.id ? -1 : 1)).map((x) => x.id).join();
    expect(sorted(b.lines) && sorted(b.links) && sorted(b.substations)).toBe(true);
  });

  it('범위 밖 국은 inScope=false 로, 그 국의 연결과 이어지는 사슬(밖선로·더밖선로)까지 싣는다', async () => {
    const b = (await get(org.branchId).expect(200)).body;
    const sub = (id: string) => b.substations.find((s: { id: string }) => s.id === id);
    expect(sub(org.s1).inScope).toBe(true);
    expect(sub(s3).inScope).toBe(false);
    expect(sub(s4).inScope).toBe(false);
    const lineIds = b.lines.map((l: { id: string }) => l.id);
    expect(lineIds).toEqual(expect.arrayContaining([ids.inL, ids.outL, ids.farL]));
    expect(lineIds).not.toContain(ids.idleL);
    expect(b.links.filter((l: { substationId: string }) => l.substationId === s3)).toHaveLength(2);
    expect(b.links.filter((l: { substationId: string }) => l.substationId === s4)).toHaveLength(1);
    expect(b.cores.filter((c: { lineId: string }) => c.lineId === ids.farL)).toHaveLength(2);
  });

  it('코어 끝 없는 연결은 빼고, 설비는 연결·광선로 끝에 나오는 것만', async () => {
    const b = (await get(org.branchId).expect(200)).body;
    expect(b.links).toHaveLength(4);
    expect(b.links.every((l: { a: { kind: string }; b: { kind: string } }) => l.a.kind === 'core' || l.b.kind === 'core')).toBe(true);
    expect(b.equipment.map((e: { id: string }) => e.id).sort()).toEqual([ids.d1, ids.d3, ids.d4].sort());
    expect(b.equipment.find((e: { id: string }) => e.id === ids.d1)).toMatchObject({ name: '송광치', substationId: org.s1, typeName: expect.any(String) });
  });

  it('국 노드 — 그 국 하나가 범위', async () => {
    const b = (await get(s3).expect(200)).body;
    expect(b.substations.filter((s: { inScope: boolean }) => s.inScope).map((s: { id: string }) => s.id)).toEqual([s3]);
    expect(b.lines.map((l: { id: string }) => l.id)).toEqual(expect.arrayContaining([ids.inL, ids.outL, ids.idleL]));
  });

  it('없는 노드는 404, 인증 없으면 401', async () => {
    await get(randomUUID()).expect(404);
    await request(app).get(`/api/v2/nodes/${org.s1}/network`).expect(401);
  });
});
