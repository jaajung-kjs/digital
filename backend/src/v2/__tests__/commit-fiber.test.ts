import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { authHeader, ensureTestMaster, makeApp, makeOrg, sweepTestFixtures, type TestMaster } from './helpers.js';

const app = makeApp();
const admin = { Authorization: authHeader('admin') };
let m: TestMaster;
let org: Awaited<ReturnType<typeof makeOrg>>;
const commit = (p: object) => request(app).put('/api/v2/commit').set(admin).send(p);

/** 국마다 OFD 와 장비 하나 — 랙·설비를 한 커밋으로. */
const site: Record<'s1' | 's2', { ofd: string; dev: string }> = { s1: { ofd: '', dev: '' }, s2: { ofd: '', dev: '' } };

beforeAll(async () => {
  await sweepTestFixtures();
  m = await ensureTestMaster();
  org = await makeOrg('t3-cf');
  for (const k of ['s1', 's2'] as const) {
    const rack = randomUUID(); const ofd = randomUUID(); const dev = randomUUID();
    await commit({
      racks: { creates: [{ id: rack, substationId: org[k], name: '통신랙', rackTypeId: m.rackTypeId }] },
      equipment: { creates: [
        { id: ofd, substationId: org[k], rackId: rack, name: 'OFD', typeId: m.equipmentTypeId, panelCount: 8 },
        { id: dev, substationId: org[k], rackId: rack, name: '송광치', typeId: m.equipmentTypeId },
      ] },
    }).expect(200);
    site[k] = { ofd, dev };
  }
});
afterAll(async () => { await sweepTestFixtures(); await nextDb.$disconnect(); });

/** 만든 광선로 수 — 같은 슬롯에 쌓이므로 어댑터 범위를 띄운다(겹치면 ⑨ 판정이 거절한다). 첫 선로는 1·25 에서 시작한다. */
let lineSeq = 0;
/** S1–S2 광선로 하나를 만들고 id 를 돌려준다. */
async function makeLine(coreCount = 24) {
  const id = randomUUID();
  const off = 1000 * lineSeq++;
  await commit({
    fiberLines: { creates: [{
      id, cableTypeId: m.fiberCableId, coreCount, name: '154kV 시험T/L', lengthKm: 18.74,
      a: { substationId: org.s1, equipmentId: site.s1.ofd, panel: 2, ...(off ? { startNo: 1 + off } : {}) },
      b: { substationId: org.s2, equipmentId: site.s2.ofd, panel: 5, startNo: 25 + off },
    }] },
  }).expect(200);
  return id;
}

describe('PUT /commit — 광선로·코어·측정·연결', () => {
  it('광선로를 만들면 코어 1..N 이 생긴다 — 두 국이 같은 행을 공유한다', async () => {
    const id = await makeLine(24);
    const cores = await nextDb.core.findMany({ where: { lineId: id }, orderBy: { no: 'asc' } });
    expect(cores.map((c) => c.no)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
    expect(cores.every((c) => c.status === 'ok')).toBe(true);
    const line = await nextDb.fiberLine.findUniqueOrThrow({ where: { id } });
    expect([line.aPanel, line.bPanel, line.bStartNo]).toEqual([2, 5, 25]);
  });

  it('같은 커밋에서 만든 광선로의 코어에 양 끝 점퍼를 건다 — 코어는 자연 키로 가리킨다', async () => {
    const lineId = randomUUID();
    await commit({
      fiberLines: { creates: [{ id: lineId, cableTypeId: m.fiberCableId, coreCount: 12,
        a: { substationId: org.s1, equipmentId: site.s1.ofd, panel: 3 }, b: { substationId: org.s2, equipmentId: site.s2.ofd, panel: 6 } }] },
      cores: { updates: [{ lineId, no: 5, patch: { role: 'main', aPurpose: 'PTP 시험 WEST' } }] },
      links: { creates: [
        { id: randomUUID(), substationId: org.s1, cableTypeId: m.commCableId, a: { kind: 'core', lineId, no: 5, side: 'A' }, b: { kind: 'equipment', equipmentId: site.s1.dev, label: 'C1 WEST Tx' } },
        { id: randomUUID(), substationId: org.s2, cableTypeId: m.commCableId, a: { kind: 'core', lineId, no: 5, side: 'B' }, b: { kind: 'equipment', equipmentId: site.s2.dev, label: 'C2 EAST Rx' } },
      ] },
    }).expect(200);
    const core = await nextDb.core.findUniqueOrThrow({ where: { lineId_no: { lineId, no: 5 } }, include: { linkEnds: true } });
    expect(core.role).toBe('main');
    expect([core.aPurpose, core.bPurpose]).toEqual(['PTP 시험 WEST', null]);
    expect(core.linkEnds.map((e) => e.coreSide).sort()).toEqual(['A', 'B']);
  });

  it('같은 접속 설비·슬롯의 어댑터 범위가 겹치거나 슬롯 수를 넘으면 422 — 서버도 같은 core 판정(⑨)', async () => {
    const at = (panel: number, startNo: number) => ({
      fiberLines: { creates: [{ id: randomUUID(), cableTypeId: m.fiberCableId, coreCount: 4, name: null, lengthKm: null,
        a: { substationId: org.s1, equipmentId: site.s1.ofd, panel: 8, startNo }, b: { substationId: org.s2, equipmentId: site.s2.ofd, panel, startNo: 900 } }] },
    });
    await commit(at(8, 500)).expect(200);
    const overlap = await commit(at(8, 502)).expect(422);
    expect(overlap.body.details.map((i: { code: string }) => i.code)).toContain('LINE_SLOT_OVERLAP');
    const range = await commit(at(9, 600)).expect(422);
    expect(range.body.details.map((i: { code: string }) => i.code)).toContain('LINE_SLOT_RANGE');
  });

  it('S1 국 연결이 B 끝(S2 쪽)을 쓰면 422 INVALID_STATE', async () => {
    const lineId = await makeLine(4);
    const res = await commit({
      links: { creates: [{ id: randomUUID(), substationId: org.s1, cableTypeId: m.commCableId,
        a: { kind: 'core', lineId, no: 1, side: 'B' }, b: { kind: 'equipment', equipmentId: site.s1.dev } }] },
    }).expect(422);
    expect(res.body.details.map((i: { code: string }) => i.code)).toContain('LINK_END_INVALID');
  });

  it('코어 끝 하나에 연결 둘이면 거부한다', async () => {
    const lineId = await makeLine(4);
    const mk = () => ({ id: randomUUID(), substationId: org.s1, cableTypeId: m.commCableId,
      a: { kind: 'core', lineId, no: 1, side: 'A' }, b: { kind: 'equipment', equipmentId: site.s1.dev } });
    await commit({ links: { creates: [mk()] } }).expect(200);
    const dup = await commit({ links: { creates: [mk()] } }).expect(422);
    expect(dup.body.error).toBe('INVALID_STATE');
  });

  it('중계국 패치 — 같은 국 두 선로의 코어 끝을 한 연결로 잇는다', async () => {
    const l1 = await makeLine(4);
    const l2 = await makeLine(4);
    await commit({
      links: { creates: [{ id: randomUUID(), substationId: org.s1, cableTypeId: m.commCableId,
        a: { kind: 'core', lineId: l1, no: 3, side: 'A' }, b: { kind: 'core', lineId: l2, no: 3, side: 'A' } }] },
    }).expect(200);
  });

  it('측정을 끝·날짜별로 쌓는다', async () => {
    const lineId = await makeLine(4);
    await commit({
      coreMeasurements: { creates: [
        { id: randomUUID(), lineId, coreNo: 1, side: 'A', measuredOn: '2024-09-25', loss1310: -6.435, dist1310: 18.74, loss1550: -4.42, dist1550: 18.747 },
        { id: randomUUID(), lineId, coreNo: 1, side: 'B', measuredOn: '2024-09-25', loss1310: -6.469, dist1310: 18.741 },
        { id: randomUUID(), lineId, coreNo: 1, side: 'A', measuredOn: '2026-03-27', loss1310: -6.5 },
      ] },
    }).expect(200);
    expect(await nextDb.coreMeasurement.count({ where: { lineId, coreNo: 1 } })).toBe(3);
  });

  it('한 커밋의 같은 날짜 측정 둘은 넣은 차례대로 서로 다른 createdAt 을 갖는다 — 「최근」이 데이터로 정해진다', async () => {
    const lineId = await makeLine(4);
    const first = randomUUID(); const second = randomUUID();
    await commit({
      coreMeasurements: { creates: [
        { id: first, lineId, coreNo: 2, side: 'A', measuredOn: '2026-10-01', loss1310: -1 },
        { id: second, lineId, coreNo: 2, side: 'A', measuredOn: '2026-10-01', loss1310: -2 },
      ] },
    }).expect(200);
    const a = await nextDb.coreMeasurement.findUniqueOrThrow({ where: { id: first } });
    const b = await nextDb.coreMeasurement.findUniqueOrThrow({ where: { id: second } });
    expect(b.createdAt.getTime()).toBeGreaterThan(a.createdAt.getTime());
  });

  it('코어 수를 줄였는데 잘릴 코어에 측정이 있으면 422 ROWS_IN_USE', async () => {
    const lineId = await makeLine(4);
    await commit({ coreMeasurements: { creates: [{ id: randomUUID(), lineId, coreNo: 4, side: 'A', loss1310: -1 }] } }).expect(200);
    const line = await nextDb.fiberLine.findUniqueOrThrow({ where: { id: lineId } });
    const res = await commit({ fiberLines: { updates: [{ id: lineId, patch: { coreCount: 2 } }] }, baseVersions: { [lineId]: line.updatedAt.toISOString() } }).expect(422);
    expect(res.body.error).toBe('ROWS_IN_USE');
    expect((await nextDb.fiberLine.findUniqueOrThrow({ where: { id: lineId } })).coreCount).toBe(4);
  });

  it('코어 수를 늘리면 뒤에 붙는다', async () => {
    const lineId = await makeLine(2);
    const line = await nextDb.fiberLine.findUniqueOrThrow({ where: { id: lineId } });
    await commit({ fiberLines: { updates: [{ id: lineId, patch: { coreCount: 4 } }] }, baseVersions: { [lineId]: line.updatedAt.toISOString() } }).expect(200);
    expect(await nextDb.core.count({ where: { lineId } })).toBe(4);
  });

  it('두 국이 같은 선로를 각자 고치면 나중 것이 409 — 소유 판정 없이 버전만 본다', async () => {
    const lineId = await makeLine(4);
    const stale = (await nextDb.fiberLine.findUniqueOrThrow({ where: { id: lineId } })).updatedAt.toISOString();
    await commit({ fiberLines: { updates: [{ id: lineId, patch: { name: 'S1 쪽에서' } }] }, baseVersions: { [lineId]: stale } }).expect(200);
    await commit({ fiberLines: { updates: [{ id: lineId, patch: { name: 'S2 쪽에서' } }] }, baseVersions: { [lineId]: stale } }).expect(409);
  });

  it('광선로 끝의 단자 설비가 그 끝 국에 없으면 422', async () => {
    const res = await commit({
      fiberLines: { creates: [{ id: randomUUID(), cableTypeId: m.fiberCableId, coreCount: 4,
        a: { substationId: org.s1, equipmentId: site.s2.ofd }, b: { substationId: org.s2 } }] },
    }).expect(422);
    expect(res.body.details.map((i: { code: string }) => i.code)).toContain('LINE_END_EQUIPMENT');
  });

  it('광선로에 통신 매체 케이블을 쓰면 422 LINE_MEDIUM', async () => {
    const res = await commit({
      fiberLines: { creates: [{ id: randomUUID(), cableTypeId: m.commCableId, coreCount: 4, a: { substationId: org.s1 }, b: { substationId: org.s2 } }] },
    }).expect(422);
    expect(res.body.details.map((i: { code: string }) => i.code)).toContain('LINE_MEDIUM');
  });

  it('점퍼가 남은 광선로를 지우면 422 DANGLING_REFERENCE, 점퍼를 함께 보내면 된다', async () => {
    const lineId = await makeLine(4);
    const linkId = randomUUID();
    await commit({ links: { creates: [{ id: linkId, substationId: org.s1, cableTypeId: m.commCableId,
      a: { kind: 'core', lineId, no: 1, side: 'A' }, b: { kind: 'equipment', equipmentId: site.s1.dev } }] } }).expect(200);
    const line = await nextDb.fiberLine.findUniqueOrThrow({ where: { id: lineId } });
    const link = await nextDb.link.findUniqueOrThrow({ where: { id: linkId } });
    await commit({ fiberLines: { deletes: [lineId] }, baseVersions: { [lineId]: line.updatedAt.toISOString() } }).expect(422);
    await commit({
      fiberLines: { deletes: [lineId] }, links: { deletes: [linkId] },
      baseVersions: { [lineId]: line.updatedAt.toISOString(), [linkId]: link.updatedAt.toISOString() },
    }).expect(200);
    expect(await nextDb.core.count({ where: { lineId } })).toBe(0);
  });

  it('연결의 설비 끝 표기를 고친다 — 다른 끝 종류에는 표기를 못 단다', async () => {
    const lineId = await makeLine(4);
    const linkId = randomUUID();
    await commit({ links: { creates: [{ id: linkId, substationId: org.s1, cableTypeId: m.commCableId,
      a: { kind: 'core', lineId, no: 2, side: 'A' }, b: { kind: 'equipment', equipmentId: site.s1.dev, label: '옛' } }] } }).expect(200);
    let link = await nextDb.link.findUniqueOrThrow({ where: { id: linkId } });
    await commit({ links: { updates: [{ id: linkId, patch: { bLabel: '새', lengthM: 3 } }] }, baseVersions: { [linkId]: link.updatedAt.toISOString() } }).expect(200);
    const end = await nextDb.linkEnd.findUniqueOrThrow({ where: { linkId_end: { linkId, end: 'B' } } });
    expect(end.label).toBe('새');
    link = await nextDb.link.findUniqueOrThrow({ where: { id: linkId } });
    await commit({ links: { updates: [{ id: linkId, patch: { aLabel: '코어에 표기' } }] }, baseVersions: { [linkId]: link.updatedAt.toISOString() } }).expect(422);
  });

  it('표기만 고쳐도 연결의 버전이 오른다 — 낡은 기준의 두 번째 쓴이는 409', async () => {
    const lineId = await makeLine(4);
    const linkId = randomUUID();
    await commit({ links: { creates: [{ id: linkId, substationId: org.s1, cableTypeId: m.commCableId,
      a: { kind: 'core', lineId, no: 3, side: 'A' }, b: { kind: 'equipment', equipmentId: site.s1.dev, label: '처음' } }] } }).expect(200);
    const stale = (await nextDb.link.findUniqueOrThrow({ where: { id: linkId } })).updatedAt.toISOString();
    await commit({ links: { updates: [{ id: linkId, patch: { bLabel: '먼저' } }] }, baseVersions: { [linkId]: stale } }).expect(200);
    const res = await commit({ links: { updates: [{ id: linkId, patch: { bLabel: '나중' } }] }, baseVersions: { [linkId]: stale } }).expect(409);
    expect(res.body.error).toBe('CONFLICT');
    expect((await nextDb.linkEnd.findUniqueOrThrow({ where: { linkId_end: { linkId, end: 'B' } } })).label).toBe('먼저');
  });

  it('OFD 를 지우면 그 광선로 끝의 단자 설비와 판을 서버가 비우고, 두 끝 국을 함께 다룬다', async () => {
    const rack = randomUUID(); const ofd = randomUUID();
    await commit({
      racks: { creates: [{ id: rack, substationId: org.s1, name: '임시 OFD 랙', rackTypeId: m.rackTypeId }] },
      equipment: { creates: [{ id: ofd, substationId: org.s1, rackId: rack, name: '임시 OFD', typeId: m.equipmentTypeId }] },
    }).expect(200);
    const lineId = randomUUID();
    await commit({ fiberLines: { creates: [{ id: lineId, cableTypeId: m.fiberCableId, coreCount: 2,
      a: { substationId: org.s1, equipmentId: ofd, panel: 1 }, b: { substationId: org.s2 } }] } }).expect(200);
    const eq = await nextDb.equipment.findUniqueOrThrow({ where: { id: ofd } });
    const lineBefore = await nextDb.fiberLine.findUniqueOrThrow({ where: { id: lineId } });
    const res = await commit({ equipment: { deletes: [ofd] }, baseVersions: { [ofd]: eq.updatedAt.toISOString() } }).expect(200);
    const line = await nextDb.fiberLine.findUniqueOrThrow({ where: { id: lineId } });
    expect([line.aEquipmentId, line.aPanel]).toEqual([null, null]);
    expect(line.updatedAt.getTime()).toBeGreaterThan(lineBefore.updatedAt.getTime());
    const log = await nextDb.changeLog.findUniqueOrThrow({ where: { id: res.body.changeLogId } });
    expect((log.summary as { substations: string[] }).substations).toEqual([org.s1, org.s2].sort());
  });

  it('연결 끝이 걸린 코어를 잘라내면 422 ROWS_IN_USE — 코어 수 그대로', async () => {
    const lineId = await makeLine(4);
    await commit({ links: { creates: [{ id: randomUUID(), substationId: org.s1, cableTypeId: m.commCableId,
      a: { kind: 'core', lineId, no: 4, side: 'A' }, b: { kind: 'equipment', equipmentId: site.s1.dev } }] } }).expect(200);
    const line = await nextDb.fiberLine.findUniqueOrThrow({ where: { id: lineId } });
    const res = await commit({ fiberLines: { updates: [{ id: lineId, patch: { coreCount: 2 } }] }, baseVersions: { [lineId]: line.updatedAt.toISOString() } }).expect(422);
    expect(res.body.error).toBe('ROWS_IN_USE');
    expect((await nextDb.fiberLine.findUniqueOrThrow({ where: { id: lineId } })).coreCount).toBe(4);
  });

  it('안 쓰는 코어는 잘라낼 수 있다', async () => {
    const lineId = await makeLine(4);
    const line = await nextDb.fiberLine.findUniqueOrThrow({ where: { id: lineId } });
    await commit({ fiberLines: { updates: [{ id: lineId, patch: { coreCount: 2 } }] }, baseVersions: { [lineId]: line.updatedAt.toISOString() } }).expect(200);
    expect(await nextDb.core.count({ where: { lineId } })).toBe(2);
  });

  it('광선로 끝을 고친다 — 판·시작번호·단자 설비, 단자는 null 로 비운다', async () => {
    const lineId = await makeLine(4);
    let line = await nextDb.fiberLine.findUniqueOrThrow({ where: { id: lineId } });
    await commit({ fiberLines: { updates: [{ id: lineId, patch: { a: { panel: 7, startNo: 9 }, b: { equipmentId: site.s2.dev } } }] },
      baseVersions: { [lineId]: line.updatedAt.toISOString() } }).expect(200);
    line = await nextDb.fiberLine.findUniqueOrThrow({ where: { id: lineId } });
    expect([line.aPanel, line.aStartNo, line.bEquipmentId, line.aEquipmentId]).toEqual([7, 9, site.s2.dev, site.s1.ofd]);
    await commit({ fiberLines: { updates: [{ id: lineId, patch: { a: { equipmentId: null } } }] },
      baseVersions: { [lineId]: line.updatedAt.toISOString() } }).expect(200);
    expect((await nextDb.fiberLine.findUniqueOrThrow({ where: { id: lineId } })).aEquipmentId).toBeNull();
  });

  it('측정을 고치고 지운다 — 날짜는 UTC 자정, 값은 null 로 비운다', async () => {
    const lineId = await makeLine(4);
    const mid = randomUUID();
    await commit({ coreMeasurements: { creates: [{ id: mid, lineId, coreNo: 2, side: 'A', measuredOn: '2024-09-25', loss1310: -6.4, dist1310: 18.7 }] } }).expect(200);
    let row = await nextDb.coreMeasurement.findUniqueOrThrow({ where: { id: mid } });
    await commit({ coreMeasurements: { updates: [{ id: mid, patch: { measuredOn: '2025-01-02', loss1310: null } }] },
      baseVersions: { [mid]: row.updatedAt.toISOString() } }).expect(200);
    row = await nextDb.coreMeasurement.findUniqueOrThrow({ where: { id: mid } });
    expect(row.measuredOn?.toISOString()).toBe('2025-01-02T00:00:00.000Z');
    expect(row.loss1310).toBeNull();
    expect(row.dist1310).not.toBeNull();
    await commit({ coreMeasurements: { deletes: [mid] }, baseVersions: { [mid]: row.updatedAt.toISOString() } }).expect(200);
    expect(await nextDb.coreMeasurement.count({ where: { id: mid } })).toBe(0);
  });

  it('없는 코어에 측정을 달면 422 DANGLING_REFERENCE', async () => {
    const lineId = await makeLine(2);
    const res = await commit({ coreMeasurements: { creates: [{ id: randomUUID(), lineId, coreNo: 9, side: 'A', loss1310: -1 }] } }).expect(422);
    expect(res.body.error).toBe('DANGLING_REFERENCE');
  });
});
