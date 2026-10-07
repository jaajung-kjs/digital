import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { authHeader, ensureTestMaster, makeApp, makeOrg, sweepTestFixtures, type TestMaster } from './helpers.js';

const app = makeApp();
const admin = { Authorization: authHeader('admin') };
let m: TestMaster;
let org: Awaited<ReturnType<typeof makeOrg>>;
const ids = { r1: randomUUID(), r2: randomUUID(), pnl: randomUUID(), dev1: randomUUID(), dev2: randomUUID(), line: randomUUID(), line2: randomUUID() };

beforeAll(async () => {
  await sweepTestFixtures();
  m = await ensureTestMaster();
  org = await makeOrg('t3-wc');
  await request(app).put('/api/v2/commit').set(admin).send({
    racks: { creates: [
      { id: ids.r1, substationId: org.s1, name: '랙1', rackTypeId: m.rackTypeId },
      { id: ids.r2, substationId: org.s2, name: '랙2', rackTypeId: m.rackTypeId },
    ] },
    equipment: { creates: [
      { id: ids.pnl, substationId: org.s1, rackId: ids.r1, name: '분전반', typeId: m.equipmentTypeId, circuitCount: 2 },
      { id: ids.dev1, substationId: org.s1, rackId: ids.r1, name: '송광치', typeId: m.equipmentTypeId, model: 'UTRANS' },
      { id: ids.dev2, substationId: org.s2, rackId: ids.r2, name: '송광치', typeId: m.equipmentTypeId },
    ] },
    fiberLines: { creates: [{ id: ids.line, cableTypeId: m.fiberCableId, coreCount: 4, name: '시험T/L',
      a: { substationId: org.s1 }, b: { substationId: org.s2, equipmentId: ids.dev2, panel: 1 } },
    /* 상대 국 안 광선로 — s1 응답에는 없고, 상대 국 점퍼 끝으로만 닿는다. */
    { id: ids.line2, cableTypeId: m.fiberCableId, coreCount: 2, name: null, a: { substationId: org.s2 }, b: { substationId: org.s2 } }] },
    links: { creates: [
      { id: randomUUID(), substationId: org.s1, cableTypeId: m.powerCableId, a: { kind: 'circuit', equipmentId: ids.pnl, no: 1 }, b: { kind: 'equipment', equipmentId: ids.dev1 } },
      { id: randomUUID(), substationId: org.s1, cableTypeId: m.commCableId, a: { kind: 'core', lineId: ids.line, no: 1, side: 'A' }, b: { kind: 'equipment', equipmentId: ids.dev1, label: 'WEST' } },
      { id: randomUUID(), substationId: org.s2, cableTypeId: m.commCableId, a: { kind: 'core', lineId: ids.line, no: 1, side: 'B' }, b: { kind: 'equipment', equipmentId: ids.dev2, label: 'EAST' } },
      { id: randomUUID(), substationId: org.s2, cableTypeId: m.commCableId, a: { kind: 'core', lineId: ids.line, no: 2, side: 'B' }, b: { kind: 'core', lineId: ids.line2, no: 1, side: 'A' } },
    ] },
    coreMeasurements: { creates: [{ id: randomUUID(), lineId: ids.line, coreNo: 2, side: 'A', measuredOn: '2024-09-25', loss1310: -6.4 }] },
  }).expect(200);
});
afterAll(async () => { await sweepTestFixtures(); await nextDb.$disconnect(); });

describe('GET /substations/:id/workingcopy', () => {
  it('국의 랙·설비(+회로)·연결(끝 참조)·광선로(+코어·측정)를 준다', async () => {
    const wc = (await request(app).get(`/api/v2/substations/${org.s1}/workingcopy`).set(admin).expect(200)).body;
    expect(wc.racks.map((r: { name: string }) => r.name)).toEqual(['랙1']);
    const pnl = wc.equipment.find((e: { id: string }) => e.id === ids.pnl);
    expect(pnl.circuits.map((c: { no: number }) => c.no)).toEqual([1, 2]);
    expect(wc.links).toHaveLength(2);
    expect(wc.links.find((l: { a: { kind: string } }) => l.a.kind === 'circuit').a).toEqual({ kind: 'circuit', equipmentId: ids.pnl, no: 1 });
    const line = wc.fiberLines[0];
    expect(line.id).toBe(ids.line);
    expect(line.bSubstationName).toBe('t3-wc-S2');
    expect(line.cores).toHaveLength(4);
    expect(line.cores[1].measurements[0].loss1310).toBe(-6.4);
  });

  it('상대 국 끝의 연결과 그 설비 이름을 참조로 싣는다 — 선번장의 「대국 연결」', async () => {
    const wc = (await request(app).get(`/api/v2/substations/${org.s1}/workingcopy`).set(admin).expect(200)).body;
    expect(wc.farLinks).toHaveLength(2);
    expect(wc.farLinks.map((l: { a: unknown }) => l.a)).toContainEqual({ kind: 'core', lineId: ids.line, no: 1, side: 'B' });
    expect(wc.refEquipment.find((e: { id: string }) => e.id === ids.dev2)).toMatchObject({ name: '송광치', substationId: org.s2 });
  });

  it('상대 국 점퍼가 물린 남의 광선로는 이름 참조(refLines)로 싣는다', async () => {
    const wc = (await request(app).get(`/api/v2/substations/${org.s1}/workingcopy`).set(admin).expect(200)).body;
    expect(wc.fiberLines.map((l: { id: string }) => l.id)).toEqual([ids.line]);
    expect(wc.refLines).toEqual([{ id: ids.line2, name: null, aSubstationName: 't3-wc-S2', bSubstationName: 't3-wc-S2' }]);
  });

  it('같은 광선로가 상대 국 응답에도 실린다(같은 id)', async () => {
    const wc2 = (await request(app).get(`/api/v2/substations/${org.s2}/workingcopy`).set(admin).expect(200)).body;
    expect(wc2.fiberLines.map((l: { id: string }) => l.id)).toContain(ids.line);
  });

  it('없는 국은 404', async () => {
    await request(app).get(`/api/v2/substations/${randomUUID()}/workingcopy`).set(admin).expect(404);
  });
});

describe('GET /nodes/:id/equipment', () => {
  it('지사 아래 설비 전부 — 랙은 세지 않는다', async () => {
    const rows = (await request(app).get(`/api/v2/nodes/${org.branchId}/equipment`).set(admin).expect(200)).body;
    expect(rows).toHaveLength(3);
    const dev1 = rows.find((r: { id: string }) => r.id === ids.dev1);
    expect(dev1).toMatchObject({ rackName: '랙1', typeName: '시험 설비', categoryName: '시험 분야', model: 'UTRANS', substationName: 't3-wc-S1' });
  });
});
