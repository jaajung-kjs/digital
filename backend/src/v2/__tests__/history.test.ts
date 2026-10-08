import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDb } from '../db.js';
import { equipmentChangeItems } from '../history.js';
import { authHeader, ensureTestMaster, makeApp, makeOrg, sweepTestFixtures, type TestMaster } from './helpers.js';

const app = makeApp();
const admin = { Authorization: authHeader('admin') };
const viewer = { Authorization: authHeader('viewer') };
let m: TestMaster;
let org: Awaited<ReturnType<typeof makeOrg>>;
const commit = (p: object) => request(app).put('/api/v2/commit').set(admin).send(p).expect(200);
const version = async (id: string) => (await nextDb.equipment.findUniqueOrThrow({ where: { id } })).updatedAt.toISOString();

type Entry = { id: string; at: string; username: string; items: { entity: string; action: string; no?: number; peerName?: string | null; fields: { name: string; before: unknown; after: unknown }[] }[] };

let pnl: string; let load: string; let rackId: string; let linkId: string;

beforeAll(async () => {
  await sweepTestFixtures();
  m = await ensureTestMaster();
  org = await makeOrg('t3-hist');
  rackId = randomUUID(); pnl = randomUUID(); load = randomUUID();
  /* 1) 랙·분전반(차단기 2)·부하 */
  await commit({
    racks: { creates: [{ id: rackId, substationId: org.s1, name: '분전반함 H', rackTypeId: m.rackTypeId }] },
    equipment: { creates: [
      { id: pnl, substationId: org.s1, rackId, name: '분전반 H', typeId: m.equipmentTypeId, circuitCount: 2 },
      { id: load, substationId: org.s1, rackId, name: '부하 H', typeId: m.equipmentTypeId },
    ] },
  });
  /* 2) 상태 고장 */
  await commit({ equipment: { updates: [{ id: pnl, patch: { status: 'fault' } }] }, baseVersions: { [pnl]: await version(pnl) } });
  /* 3) 차단기 2 표기 */
  const c2 = await nextDb.circuit.findUniqueOrThrow({ where: { equipmentId_no: { equipmentId: pnl, no: 2 } } });
  await commit({ circuits: { updates: [{ equipmentId: pnl, no: 2, patch: { label: 'MCCB2' } }] }, baseVersions: { [`circuit:${pnl}:2`]: c2.updatedAt.toISOString() } });
  /* 4) 차단기 2 → 부하 연결 */
  linkId = randomUUID();
  await commit({ links: { creates: [{ id: linkId, substationId: org.s1, cableTypeId: m.powerCableId, a: { kind: 'circuit', equipmentId: pnl, no: 2 }, b: { kind: 'equipment', equipmentId: load, label: 'AC IN' } }] } });
  /* 5) 부하만 고친 커밋 — 분전반 이력에는 없어야 한다 */
  await commit({ equipment: { updates: [{ id: load, patch: { note: '부하 비고' } }] }, baseVersions: { [load]: await version(load) } });
  /* 6) 고장 이력 등록 */
  await commit({ records: { maintenance: { creates: [{ id: randomUUID(), equipmentId: pnl, occurredAt: '2026-10-01T00:00:00.000Z', content: '차단기 트립' }] } } });
});
afterAll(async () => { await sweepTestFixtures(); await nextDb.$disconnect(); });

describe('GET /equipment/:id/changes', () => {
  it('그 설비에 닿은 커밋만, 최신부터 — 설비·차단기·연결·기록', async () => {
    const res = await request(app).get(`/api/v2/equipment/${pnl}/changes`).set(admin).expect(200);
    const entries = res.body.entries as Entry[];
    expect(entries.map((e) => e.items.map((i) => `${i.entity}:${i.action}`))).toEqual([
      ['maintenance:create'], ['link:create'], ['circuit:update'], ['equipment:update'], ['equipment:create'],
    ]);
    expect(res.body.nextCursor).toBeNull();
    expect(entries[0]!.username).toBe('tester');
    expect(entries[2]!.items[0]).toMatchObject({ no: 2, fields: [{ name: 'label', before: null, after: 'MCCB2' }] });
    expect(entries[3]!.items[0]!.fields).toEqual([{ name: 'status', before: 'normal', after: 'fault' }]);
    /* 연결 — 다른 끝 이름과, 이 설비 쪽/다른 쪽 포트. 케이블 품목은 이름으로. */
    const link = entries[1]!.items[0]!;
    expect(link.peerName).toBe('부하 H');
    expect(link.fields).toEqual(expect.arrayContaining([{ name: 'peerLabel', before: null, after: 'AC IN' }, { name: 'cableTypeId', before: null, after: '시험 POWER' }]));
    /* 만들기 — 랙은 이름으로 */
    expect(entries[4]!.items[0]!.fields).toEqual(expect.arrayContaining([{ name: 'rackId', before: null, after: '분전반함 H' }, { name: 'name', before: null, after: '분전반 H' }]));
  });

  it('연결의 다른 끝 설비에서도 보인다 — 포트는 그 설비 쪽으로 바뀐다', async () => {
    const res = await request(app).get(`/api/v2/equipment/${load}/changes`).set(viewer).expect(200);
    const entries = res.body.entries as Entry[];
    expect(entries.map((e) => e.items[0]!.entity)).toEqual(['equipment', 'link', 'equipment']);
    expect(entries[1]!.items[0]!.fields).toEqual(expect.arrayContaining([{ name: 'label', before: null, after: 'AC IN' }]));
    expect(entries[1]!.items[0]!.peerName).toBe('분전반 H');
  });

  it('쪽 나누기 — limit 과 cursor 로 이어 읽으면 겹침도 빠짐도 없다', async () => {
    const all = (await request(app).get(`/api/v2/equipment/${pnl}/changes`).set(admin).expect(200)).body.entries as Entry[];
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i++) {
      const url: string = `/api/v2/equipment/${pnl}/changes?limit=2${cursor ? `&cursor=${cursor}` : ''}`;
      const body = (await request(app).get(url).set(admin).expect(200)).body as { entries: Entry[]; nextCursor: string | null };
      seen.push(...body.entries.map((e) => e.id));
      cursor = body.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toEqual(all.map((e) => e.id));
  });

  it('연결 표기 수정·삭제도 이력에 남는다', async () => {
    const link = await nextDb.link.findUniqueOrThrow({ where: { id: linkId } });
    await commit({ links: { updates: [{ id: linkId, patch: { bLabel: 'AC IN 2' } }] }, baseVersions: { [linkId]: link.updatedAt.toISOString() } });
    const after = await nextDb.link.findUniqueOrThrow({ where: { id: linkId } });
    await commit({ links: { deletes: [linkId] }, baseVersions: { [linkId]: after.updatedAt.toISOString() } });
    const entries = (await request(app).get(`/api/v2/equipment/${pnl}/changes?limit=2`).set(admin).expect(200)).body.entries as Entry[];
    expect(entries[0]!.items[0]).toMatchObject({ entity: 'link', action: 'delete', peerName: '부하 H' });
    expect(entries[1]!.items[0]).toMatchObject({ entity: 'link', action: 'update', fields: [{ name: 'peerLabel', before: 'AC IN', after: 'AC IN 2' }] });
  });

  it('없는 설비는 404, 로그인하지 않으면 401', async () => {
    await request(app).get(`/api/v2/equipment/${randomUUID()}/changes`).set(admin).expect(404);
    await request(app).get(`/api/v2/equipment/${pnl}/changes`).expect(401);
    await request(app).get(`/api/v2/equipment/${pnl}/changes?cursor=zz`).set(admin).expect(400);
  });
});

describe('equipmentChangeItems — 판정', () => {
  it('알 수 없는 꼴은 건너뛰고, 지운 기록은 무엇이었는지를 before 로 적는다', () => {
    const items = equipmentChangeItems([
      null, { entity: 'equipment' }, { entity: 'floor', id: 'f', op: 'create', after: {} },
      { entity: 'inspection', id: 'i1', op: 'delete', before: { id: 'i1', equipmentId: 'E', content: '외관 점검', result: null } },
      { entity: 'inspection', id: 'i2', op: 'delete', before: { id: 'i2', equipmentId: 'X', content: '남의 것' } },
    ], 'E');
    expect(items).toEqual([{ entity: 'inspection', action: 'delete', id: 'i1', fields: [{ name: 'content', before: '외관 점검', after: null }] }]);
  });

  it('바뀌지 않은 칸만 실린 고치기는 줄을 내지 않는다 — 날짜는 날 단위로 견준다', () => {
    expect(equipmentChangeItems([
      { entity: 'equipment', id: 'E', op: 'update', before: { installDate: '2020-01-02T00:00:00.000Z' }, after: { installDate: '2020-01-02' } },
    ], 'E')).toEqual([]);
  });
});
