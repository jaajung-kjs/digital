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

/** S1–S2 광선로 하나를 만들고 id 를 돌려준다. */
async function makeLine(coreCount = 24) {
  const id = randomUUID();
  await commit({
    fiberLines: { creates: [{
      id, cableTypeId: m.fiberCableId, coreCount, name: '154kV 시험T/L', lengthKm: 18.74,
      a: { substationId: org.s1, equipmentId: site.s1.ofd, panel: 2 },
      b: { substationId: org.s2, equipmentId: site.s2.ofd, panel: 5, startNo: 25 },
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
      cores: { updates: [{ lineId, no: 5, patch: { role: 'main', purpose: 'PTP 시험 WEST' } }] },
      links: { creates: [
        { id: randomUUID(), substationId: org.s1, cableTypeId: m.commCableId, a: { kind: 'core', lineId, no: 5, side: 'A' }, b: { kind: 'equipment', equipmentId: site.s1.dev, label: 'C1 WEST Tx' } },
        { id: randomUUID(), substationId: org.s2, cableTypeId: m.commCableId, a: { kind: 'core', lineId, no: 5, side: 'B' }, b: { kind: 'equipment', equipmentId: site.s2.dev, label: 'C2 EAST Rx' } },
      ] },
    }).expect(200);
    const core = await nextDb.core.findUniqueOrThrow({ where: { lineId_no: { lineId, no: 5 } }, include: { linkEnds: true } });
    expect(core.role).toBe('main');
    expect(core.linkEnds.map((e) => e.coreSide).sort()).toEqual(['A', 'B']);
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
    await commit({ links: { creates: [mk()] } }).expect(422);
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

  it('OFD 를 지우면 클라이언트가 보낸 대로 — 광선로 끝 단자는 DB 가 비운다(SetNull)', async () => {
    const rack = randomUUID(); const ofd = randomUUID();
    await commit({
      racks: { creates: [{ id: rack, substationId: org.s1, name: '임시 OFD 랙', rackTypeId: m.rackTypeId }] },
      equipment: { creates: [{ id: ofd, substationId: org.s1, rackId: rack, name: '임시 OFD', typeId: m.equipmentTypeId }] },
    }).expect(200);
    const lineId = randomUUID();
    await commit({ fiberLines: { creates: [{ id: lineId, cableTypeId: m.fiberCableId, coreCount: 2,
      a: { substationId: org.s1, equipmentId: ofd, panel: 1 }, b: { substationId: org.s2 } }] } }).expect(200);
    const eq = await nextDb.equipment.findUniqueOrThrow({ where: { id: ofd } });
    await commit({ equipment: { deletes: [ofd] }, baseVersions: { [ofd]: eq.updatedAt.toISOString() } }).expect(200);
    expect((await nextDb.fiberLine.findUniqueOrThrow({ where: { id: lineId } })).aEquipmentId).toBeNull();
  });
});
