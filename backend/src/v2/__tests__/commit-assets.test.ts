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

beforeAll(async () => {
  await sweepTestFixtures();
  m = await ensureTestMaster();
  org = await makeOrg('t3-ca');
});
afterAll(async () => { await sweepTestFixtures(); await nextDb.$disconnect(); });

/** 랙 하나 + 설비 하나를 한 커밋으로. */
async function rackWithEquipment(sub: string, name: string, circuitCount = 0) {
  const rackId = randomUUID();
  const eqId = randomUUID();
  await commit({
    racks: { creates: [{ id: rackId, substationId: sub, name, rackTypeId: m.rackTypeId }] },
    equipment: { creates: [{ id: eqId, substationId: sub, rackId, name, typeId: m.equipmentTypeId, circuitCount }] },
  }).expect(200);
  return { rackId, eqId };
}

describe('PUT /commit — 랙·설비', () => {
  it('랙과 설비를 한 커밋으로 만들고, 일체형은 같은 이름을 쓴다', async () => {
    const { eqId } = await rackWithEquipment(org.s1, 'UPS#1');
    const eq = await nextDb.equipment.findUniqueOrThrow({ where: { id: eqId }, include: { rack: true } });
    expect(eq.rack.name).toBe('UPS#1');
    expect(eq.status).toBe('normal');
  });

  it('회로 수만큼 회로 행이 생기고, 늘리면 뒤에 붙는다', async () => {
    const { eqId } = await rackWithEquipment(org.s1, '분전반 P1', 3);
    expect((await nextDb.circuit.findMany({ where: { equipmentId: eqId } })).map((c) => c.no)).toEqual([1, 2, 3]);
    const eq = await nextDb.equipment.findUniqueOrThrow({ where: { id: eqId } });
    await commit({
      equipment: { updates: [{ id: eqId, patch: { circuitCount: 5 } }] },
      baseVersions: { [eqId]: eq.updatedAt.toISOString() },
    }).expect(200);
    expect((await nextDb.circuit.findMany({ where: { equipmentId: eqId }, orderBy: { no: 'asc' } })).map((c) => c.no)).toEqual([1, 2, 3, 4, 5]);
    const after = await nextDb.equipment.findUniqueOrThrow({ where: { id: eqId } });
    expect(after.circuitCount).toBe(5);
    expect(after.updatedAt.getTime()).toBeGreaterThan(eq.updatedAt.getTime());
  });

  it('회로 수를 2→4 로 늘린 뒤 새 회로 4 에 연결을 건다', async () => {
    const pnl = await rackWithEquipment(org.s1, '분전반 P4', 2);
    const load = await rackWithEquipment(org.s1, '부하 P4');
    const eq = await nextDb.equipment.findUniqueOrThrow({ where: { id: pnl.eqId } });
    await commit({
      equipment: { updates: [{ id: pnl.eqId, patch: { circuitCount: 4 } }] },
      baseVersions: { [pnl.eqId]: eq.updatedAt.toISOString() },
    }).expect(200);
    await commit({
      links: { creates: [{ id: randomUUID(), substationId: org.s1, cableTypeId: m.powerCableId,
        a: { kind: 'circuit', equipmentId: pnl.eqId, no: 4 }, b: { kind: 'equipment', equipmentId: load.eqId } }] },
    }).expect(200);
  });

  it('같은 커밋에서 만든 설비의 회로 값을 고친다 — 회로는 자연 키로 가리킨다', async () => {
    const rackId = randomUUID(); const eqId = randomUUID();
    await commit({
      racks: { creates: [{ id: rackId, substationId: org.s1, name: '분전반함 P2', rackTypeId: m.rackTypeId }] },
      equipment: { creates: [{ id: eqId, substationId: org.s1, rackId, name: '분전반 P2', typeId: m.equipmentTypeId, circuitCount: 2 }] },
      circuits: { updates: [{ equipmentId: eqId, no: 2, patch: { label: 'CB2', capacity: '30A', current: 'AC', switch: 'off', purpose: '예비' } }] },
    }).expect(200);
    const c = await nextDb.circuit.findUniqueOrThrow({ where: { equipmentId_no: { equipmentId: eqId, no: 2 } } });
    expect([c.label, c.capacity, c.current, c.switch, c.purpose]).toEqual(['CB2', '30A', 'AC', 'off', '예비']);
  });

  it('회로 수를 줄였는데 잘릴 회로에 연결이 있으면 422 ROWS_IN_USE, 아무것도 안 바뀐다', async () => {
    const pnl = await rackWithEquipment(org.s1, '분전반 P3', 2);
    const load = await rackWithEquipment(org.s1, '부하 P3');
    await commit({
      links: { creates: [{ id: randomUUID(), substationId: org.s1, cableTypeId: m.powerCableId,
        a: { kind: 'circuit', equipmentId: pnl.eqId, no: 2 }, b: { kind: 'equipment', equipmentId: load.eqId } }] },
    }).expect(200);
    const eq = await nextDb.equipment.findUniqueOrThrow({ where: { id: pnl.eqId } });
    const res = await commit({
      equipment: { updates: [{ id: pnl.eqId, patch: { circuitCount: 1, note: '바뀌면 안 됨' } }] },
      baseVersions: { [pnl.eqId]: eq.updatedAt.toISOString() },
    }).expect(422);
    expect(res.body.error).toBe('ROWS_IN_USE');
    const after = await nextDb.equipment.findUniqueOrThrow({ where: { id: pnl.eqId } });
    expect(after.circuitCount).toBe(2);
    expect(after.note).toBeNull();
  });

  it('설비를 지우면서 닿은 연결을 안 보내면 422 DANGLING_REFERENCE — 서버가 몰래 지우지 않는다', async () => {
    const a = await rackWithEquipment(org.s1, '설비 D1');
    const b = await rackWithEquipment(org.s1, '설비 D2');
    const linkId = randomUUID();
    await commit({
      links: { creates: [{ id: linkId, substationId: org.s1, cableTypeId: m.commCableId,
        a: { kind: 'equipment', equipmentId: a.eqId, label: 'Gi0/1' }, b: { kind: 'equipment', equipmentId: b.eqId } }] },
    }).expect(200);
    const eq = await nextDb.equipment.findUniqueOrThrow({ where: { id: a.eqId } });
    const res = await commit({ equipment: { deletes: [a.eqId] }, baseVersions: { [a.eqId]: eq.updatedAt.toISOString() } }).expect(422);
    expect(res.body.error).toBe('DANGLING_REFERENCE');
    const link = await nextDb.link.findUniqueOrThrow({ where: { id: linkId } });
    await commit({
      links: { deletes: [linkId] }, equipment: { deletes: [a.eqId] },
      baseVersions: { [a.eqId]: eq.updatedAt.toISOString(), [linkId]: link.updatedAt.toISOString() },
    }).expect(200);
    expect(await nextDb.equipment.findUnique({ where: { id: a.eqId } })).toBeNull();
  });

  it('설비가 남은 랙은 지울 수 없다 — 422 DANGLING_REFERENCE', async () => {
    const { rackId } = await rackWithEquipment(org.s1, '랙 R1');
    const rack = await nextDb.rack.findUniqueOrThrow({ where: { id: rackId } });
    const res = await commit({ racks: { deletes: [rackId] }, baseVersions: { [rackId]: rack.updatedAt.toISOString() } }).expect(422);
    expect(res.body.error).toBe('DANGLING_REFERENCE');
  });

  it('같은 국 설비 이름이 겹치면 409 NAME_TAKEN, 다른 국은 괜찮다', async () => {
    await rackWithEquipment(org.s1, '겹침');
    const rackId = randomUUID();
    const res = await commit({
      racks: { creates: [{ id: rackId, substationId: org.s1, name: '겹침 랙2', rackTypeId: m.rackTypeId }] },
      equipment: { creates: [{ id: randomUUID(), substationId: org.s1, rackId, name: '겹침', typeId: m.equipmentTypeId }] },
    }).expect(409);
    expect(res.body.error).toBe('NAME_TAKEN');
    await rackWithEquipment(org.s2, '겹침');
  });

  it('설비의 랙이 다른 국이면 422 INVALID_STATE 와 흠 목록', async () => {
    const { rackId } = await rackWithEquipment(org.s2, '남의 랙');
    const res = await commit({
      equipment: { creates: [{ id: randomUUID(), substationId: org.s1, rackId, name: '잘못 든 설비', typeId: m.equipmentTypeId }] },
    }).expect(422);
    expect(res.body.error).toBe('INVALID_STATE');
    expect(res.body.details.map((i: { code: string }) => i.code)).toContain('EQUIPMENT_RACK_INVALID');
  });

  it('남이 먼저 고친 설비를 고치면 409 CONFLICT', async () => {
    const { eqId } = await rackWithEquipment(org.s1, 'OCC');
    const stale = (await nextDb.equipment.findUniqueOrThrow({ where: { id: eqId } })).updatedAt.toISOString();
    await commit({ equipment: { updates: [{ id: eqId, patch: { note: '먼저' } }] }, baseVersions: { [eqId]: stale } }).expect(200);
    const res = await commit({ equipment: { updates: [{ id: eqId, patch: { note: '나중' } }] }, baseVersions: { [eqId]: stale } }).expect(409);
    expect(res.body.error).toBe('CONFLICT');
    expect(res.body.details[0]).toMatchObject({ key: eqId, reason: 'modified' });
  });

  it('회로 행도 OCC 를 탄다 — 키는 circuit:<설비>:<번호>', async () => {
    const { eqId } = await rackWithEquipment(org.s1, '분전반 OCC', 1);
    const row = await nextDb.circuit.findUniqueOrThrow({ where: { equipmentId_no: { equipmentId: eqId, no: 1 } } });
    const key = `circuit:${eqId}:1`;
    await commit({ circuits: { updates: [{ equipmentId: eqId, no: 1, patch: { label: 'A' } }] }, baseVersions: { [key]: row.updatedAt.toISOString() } }).expect(200);
    await commit({ circuits: { updates: [{ equipmentId: eqId, no: 1, patch: { label: 'B' } }] }, baseVersions: { [key]: row.updatedAt.toISOString() } }).expect(409);
  });

  it('두 국을 한 커밋으로 — 하나가 틀리면 둘 다 안 들어간다', async () => {
    const r1 = randomUUID(); const r2 = randomUUID();
    await commit({
      racks: { creates: [
        { id: r1, substationId: org.s1, name: '원자 랙', rackTypeId: m.rackTypeId },
        { id: r2, substationId: org.s2, name: '원자 랙', rackTypeId: m.rackTypeId },
      ] },
      equipment: { creates: [{ id: randomUUID(), substationId: org.s1, rackId: r2, name: '틀림', typeId: m.equipmentTypeId }] },
    }).expect(422);
    expect(await nextDb.rack.count({ where: { id: { in: [r1, r2] } } })).toBe(0);
  });

  it('층·기록도 같은 커밋으로 — 그리고 변경 이력이 한 줄 남는다', async () => {
    const floorId = randomUUID();
    const { eqId } = await rackWithEquipment(org.s1, '기록 설비');
    const before = await nextDb.changeLog.count({ where: { userId: 'test-user' } });
    const res = await commit({
      floors: { creates: [{ id: floorId, substationId: org.s1, name: '3층', sortOrder: 0 }] },
      records: {
        maintenance: { creates: [{ id: randomUUID(), equipmentId: eqId, occurredAt: '2026-10-01T00:00:00.000Z', content: '정비' }] },
        inspections: { creates: [{ id: randomUUID(), equipmentId: eqId, inspectedAt: '2026-10-02T00:00:00.000Z', content: '점검', result: '양호' }] },
      },
    }).expect(200);
    expect(res.body.changeLogId).toBeTruthy();
    expect(await nextDb.changeLog.count({ where: { userId: 'test-user' } })).toBe(before + 1);
    const log = await nextDb.changeLog.findUniqueOrThrow({ where: { id: res.body.changeLogId } });
    expect((log.summary as { ops: { entity: string }[] }).ops.map((o) => o.entity).sort()).toEqual(['floor', 'inspection', 'maintenance']);
  });

  it('같은 이름의 철거+신설을 한 커밋으로 — 랙·설비·층', async () => {
    const r = await rackWithEquipment(org.s1, '철거신설 랙');
    const e = await rackWithEquipment(org.s1, '철거신설 설비');
    const fl = randomUUID();
    await commit({ floors: { creates: [{ id: fl, substationId: org.s1, name: '3층R', sortOrder: 0 }] } }).expect(200);
    const rackRow = await nextDb.rack.findUniqueOrThrow({ where: { id: e.rackId } });
    const eqRow = await nextDb.equipment.findUniqueOrThrow({ where: { id: e.eqId } });
    const flRow = await nextDb.floor.findUniqueOrThrow({ where: { id: fl } });
    // (b) 설비 E 철거 + 같은 이름 신설(같은 랙)
    await commit({
      equipment: { deletes: [e.eqId], creates: [{ id: randomUUID(), substationId: org.s1, rackId: e.rackId, name: '철거신설 설비', typeId: m.equipmentTypeId }] },
      baseVersions: { [e.eqId]: eqRow.updatedAt.toISOString() },
    }).expect(200);
    // (a) 빈 랙 철거 + 같은 이름 신설 (e 의 랙은 비워서)
    const rr = randomUUID(); const rrRow = await nextDb.rack.findUniqueOrThrow({ where: { id: r.rackId } });
    await commit({
      equipment: { deletes: [r.eqId] }, racks: { deletes: [r.rackId], creates: [{ id: rr, substationId: org.s1, name: '철거신설 랙', rackTypeId: m.rackTypeId }] },
      baseVersions: { [r.eqId]: (await nextDb.equipment.findUniqueOrThrow({ where: { id: r.eqId } })).updatedAt.toISOString(), [r.rackId]: rrRow.updatedAt.toISOString() },
    }).expect(200);
    expect(await nextDb.rack.findUnique({ where: { id: rr } })).not.toBeNull();
    void rackRow;
    // (c) 층
    await commit({
      floors: { deletes: [fl], creates: [{ id: randomUUID(), substationId: org.s1, name: '3층R', sortOrder: 0 }] },
      baseVersions: { [fl]: flRow.updatedAt.toISOString() },
    }).expect(200);
  });

  it('새 랙을 만들고 설비를 옮기고 옛 랙을 지운다 — 한 커밋, 새 랙이 옛 이름을 써도 된다', async () => {
    for (const reuse of [false, true]) {
      const old = await rackWithEquipment(org.s1, `이사 랙 ${reuse}`);
      const newRack = randomUUID();
      const eqRow = await nextDb.equipment.findUniqueOrThrow({ where: { id: old.eqId } });
      const rackRow = await nextDb.rack.findUniqueOrThrow({ where: { id: old.rackId } });
      await commit({
        racks: { creates: [{ id: newRack, substationId: org.s1, name: reuse ? `이사 랙 ${reuse}` : '이사 새 랙', rackTypeId: m.rackTypeId }], deletes: [old.rackId] },
        equipment: { updates: [{ id: old.eqId, patch: { rackId: newRack } }] },
        baseVersions: { [old.eqId]: eqRow.updatedAt.toISOString(), [old.rackId]: rackRow.updatedAt.toISOString() },
      }).expect(200);
      expect((await nextDb.equipment.findUniqueOrThrow({ where: { id: old.eqId } })).rackId).toBe(newRack);
      expect(await nextDb.rack.findUnique({ where: { id: old.rackId } })).toBeNull();
    }
  });

  it('변경 이력에 고치기·지우기의 적용 전 행(before)이 남는다', async () => {
    const a = await rackWithEquipment(org.s1, '이력 A');
    const b = await rackWithEquipment(org.s1, '이력 B');
    const linkId = randomUUID();
    await commit({ links: { creates: [{ id: linkId, substationId: org.s1, cableTypeId: m.commCableId,
      a: { kind: 'equipment', equipmentId: a.eqId, label: 'P1' }, b: { kind: 'equipment', equipmentId: b.eqId } }] } }).expect(200);
    const eq = await nextDb.equipment.findUniqueOrThrow({ where: { id: a.eqId } });
    await commit({ equipment: { updates: [{ id: a.eqId, patch: { note: '옛 메모' } }] }, baseVersions: { [a.eqId]: eq.updatedAt.toISOString() } }).expect(200);
    const eq2 = await nextDb.equipment.findUniqueOrThrow({ where: { id: a.eqId } });
    const link = await nextDb.link.findUniqueOrThrow({ where: { id: linkId } });
    const res = await commit({
      equipment: { updates: [{ id: a.eqId, patch: { note: '새 메모' } }] }, links: { deletes: [linkId] },
      baseVersions: { [a.eqId]: eq2.updatedAt.toISOString(), [linkId]: link.updatedAt.toISOString() },
    }).expect(200);
    const log = await nextDb.changeLog.findUniqueOrThrow({ where: { id: res.body.changeLogId } });
    type Op = { entity: string; id: string; op: string; before?: Record<string, unknown> & { ends?: { end: string; label: string | null }[] }; after?: Record<string, unknown> };
    const ops = (log.summary as { ops: Op[] }).ops;
    const eqOp = ops.find((o) => o.entity === 'equipment')!;
    expect(eqOp).toMatchObject({ id: a.eqId, op: 'update', before: { note: '옛 메모' }, after: { note: '새 메모' } });
    const linkOp = ops.find((o) => o.entity === 'link')!;
    expect(linkOp).toMatchObject({ id: linkId, op: 'delete', before: { id: linkId, substationId: org.s1, cableTypeId: m.commCableId } });
    expect(linkOp.before!.ends!.find((e) => e.end === 'A')!.label).toBe('P1');
  });

  it('달력에 없는 날짜는 400 — 500 이 아니다', async () => {
    const { eqId } = await rackWithEquipment(org.s1, '날짜 설비');
    const eq = await nextDb.equipment.findUniqueOrThrow({ where: { id: eqId } });
    await commit({ equipment: { updates: [{ id: eqId, patch: { installDate: '2024-02-31' } }] }, baseVersions: { [eqId]: eq.updatedAt.toISOString() } }).expect(400);
    await commit({ equipment: { updates: [{ id: eqId, patch: { installDate: '2024-02-29' } }] }, baseVersions: { [eqId]: eq.updatedAt.toISOString() } }).expect(200);
  });

  it('기록 고치기만 보내도 반영되고, 이력에 그 설비의 국이 남는다', async () => {
    const { eqId } = await rackWithEquipment(org.s1, '기록 고치기');
    const mid = randomUUID();
    await commit({ records: { maintenance: { creates: [{ id: mid, equipmentId: eqId, occurredAt: '2026-10-01T00:00:00.000Z', content: '처음' }] } } }).expect(200);
    const row = await nextDb.maintenanceLog.findUniqueOrThrow({ where: { id: mid } });
    const res = await commit({
      records: { maintenance: { updates: [{ id: mid, patch: { content: '고침' } }] } },
      baseVersions: { [mid]: row.updatedAt.toISOString() },
    }).expect(200);
    expect((await nextDb.maintenanceLog.findUniqueOrThrow({ where: { id: mid } })).content).toBe('고침');
    const log = await nextDb.changeLog.findUniqueOrThrow({ where: { id: res.body.changeLogId } });
    expect((log.summary as { substations: string[] }).substations).toContain(org.s1);
  });

  it('기록 고치기에 낡은 기준 버전이면 409 CONFLICT', async () => {
    const { eqId } = await rackWithEquipment(org.s1, '기록 OCC');
    const mid = randomUUID();
    await commit({ records: { maintenance: { creates: [{ id: mid, equipmentId: eqId, occurredAt: '2026-10-01T00:00:00.000Z', content: 'a' }] } } }).expect(200);
    const stale = (await nextDb.maintenanceLog.findUniqueOrThrow({ where: { id: mid } })).updatedAt.toISOString();
    await commit({ records: { maintenance: { updates: [{ id: mid, patch: { content: 'b' } }] } }, baseVersions: { [mid]: stale } }).expect(200);
    const res = await commit({ records: { maintenance: { updates: [{ id: mid, patch: { content: 'c' } }] } }, baseVersions: { [mid]: stale } }).expect(409);
    expect(res.body.error).toBe('CONFLICT');
  });

  it('없는 국에 만들면 404', async () => {
    await commit({ racks: { creates: [{ id: randomUUID(), substationId: randomUUID(), name: 'x', rackTypeId: m.rackTypeId }] } }).expect(404);
  });

  it('보는 사람은 저장할 수 없다', async () => {
    await request(app).put('/api/v2/commit').set({ Authorization: authHeader('viewer') }).send({}).expect(403);
  });
});
