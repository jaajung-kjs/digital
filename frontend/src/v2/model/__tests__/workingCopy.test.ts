import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Workingcopy } from '../types';

const wcOf: Record<string, Workingcopy> = {};
/* 이 저장소는 mockReset 이라 vi.fn 구현이 시험마다 지워진다 — 일반 함수 + 호출 기록을 쓴다. */
const fetched: string[] = [];
vi.mock('../api', () => ({
  fetchWorkingcopy: async (id: string) => { fetched.push(id); return structuredClone(wcOf[id]!); },
  putCommit: async () => ({}),
}));

import { workingCopyStore as store } from '../store/workingCopy';
import { effectiveCircuits, effectiveRows, bySubstation, toModelState } from '../store/effective';
import { deleteRows } from '../store/deleteActions';

const base = (id: string, name: string): Workingcopy => ({
  substation: { id, name }, floors: [], racks: [], equipment: [], links: [], fiberLines: [],
  farLinks: [], refEquipment: [], maintenanceLogs: [], inspectionLogs: [], photos: [],
});

beforeEach(() => {
  fetched.length = 0;
  wcOf.S1 = base('S1', '북춘천');
  wcOf.S1.racks = [{ id: 'r1', substationId: 'S1', name: '통신랙', rackTypeId: 'rt', floorId: null, x: null, y: null, width: null, height: null, facing: null, updatedAt: 't1' }];
  wcOf.S1.equipment = [
    { id: 'pnl', substationId: 'S1', rackId: 'r1', name: '분전반', typeId: 'et', status: 'normal', model: null, maker: null, madeOn: null, serial: null, installDate: null, manager: null, note: null, circuitCount: 2, panelCount: null, updatedAt: 't2',
      circuits: [
        { equipmentId: 'pnl', no: 1, label: 'CB1', current: 'AC', voltage: null, capacity: '30A', phase: null, switch: 'on', purpose: null, updatedAt: 'c1' },
        { equipmentId: 'pnl', no: 2, label: null, current: null, voltage: null, capacity: null, phase: null, switch: null, purpose: null, updatedAt: 'c2' },
      ] },
    { id: 'ote', substationId: 'S1', rackId: 'r1', name: '송광치', typeId: 'et', status: 'normal', model: null, maker: null, madeOn: null, serial: null, installDate: null, manager: null, note: null, circuitCount: 0, panelCount: null, updatedAt: 't3', circuits: [] },
  ];
  wcOf.S1.links = [{ id: 'k1', substationId: 'S1', cableTypeId: null, lengthM: null, spec: null, note: null, pathPoints: [], a: { kind: 'circuit', equipmentId: 'pnl', no: 1 }, b: { kind: 'equipment', equipmentId: 'ote' }, updatedAt: 'k1t' }];
  wcOf.S2 = base('S2', '춘천HP');
  store.getState().reset();
});

describe('공사 단위 워킹카피', () => {
  it('국을 옮겨 들러도 오버레이를 버리지 않는다 — 두 국의 변경이 함께 쌓인다', async () => {
    const s = store.getState();
    await s.ensureLoaded('S1');
    s.update('equipment', 'ote', { note: 'A국에서' });
    await s.ensureLoaded('S2');
    store.getState().create('racks', { id: 'r9', substationId: 'S2', name: '새 랙', rackTypeId: 'rt', floorId: null, x: null, y: null, width: null, height: null, facing: null, updatedAt: '' });
    const st = store.getState();
    expect(st.loaded).toEqual(['S1', 'S2']);
    expect(st.dirtyCount()).toBe(2);
    expect(st.touchedSubstations().sort()).toEqual(['S1', 'S2']);
    expect(bySubstation(effectiveRows(st, 'racks'), 'S2').map((r) => r.name)).toEqual(['새 랙']);
  });

  it('같은 국을 다시 들러도 두 번 읽지 않는다', async () => {
    await store.getState().ensureLoaded('S1');
    await store.getState().ensureLoaded('S1');
    expect(fetched).toEqual(['S1']);
  });

  it('회로 수를 늘리면 저장 전에도 새 회로가 보이고 값을 적을 수 있다', async () => {
    const s = store.getState();
    await s.ensureLoaded('S1');
    s.update('equipment', 'pnl', { circuitCount: 4 });
    s.updateCircuit('pnl', 4, { label: 'CB4' });
    const cs = effectiveCircuits(store.getState(), 'pnl');
    expect(cs.map((c) => c.no)).toEqual([1, 2, 3, 4]);
    expect(cs[3]!.label).toBe('CB4');
    expect(cs[0]!.label).toBe('CB1');
  });

  it('회로 수를 줄이면 잘린 번호는 보이지 않는다', async () => {
    const s = store.getState();
    await s.ensureLoaded('S1');
    s.update('equipment', 'pnl', { circuitCount: 1 });
    expect(effectiveCircuits(store.getState(), 'pnl').map((c) => c.no)).toEqual([1]);
  });

  it('설비를 지우면 닿은 연결이 함께 오버레이에 들어간다(expandDeletes)', async () => {
    await store.getState().ensureLoaded('S1');
    const r = deleteRows({ equipment: ['ote'] });
    expect(r.blocked).toEqual([]);
    const st = store.getState();
    expect(st.overlays.equipment.deletes).toEqual(['ote']);
    expect(st.overlays.links.deletes).toEqual(['k1']);
  });

  it('설비가 남은 랙 지우기는 막히고 아무것도 바뀌지 않는다', async () => {
    await store.getState().ensureLoaded('S1');
    const r = deleteRows({ racks: ['r1'] });
    expect(r.blocked[0]!.id).toBe('r1');
    expect(store.getState().dirtyCount()).toBe(0);
  });

  it('지운 설비의 저장 안 된 기록·사진은 함께 걷힌다', async () => {
    await store.getState().ensureLoaded('S1');
    store.getState().create('maintenance', { id: 'm1', equipmentId: 'ote', occurredAt: '2026-10-01T00:00:00.000Z', content: 'x', action: null, updatedAt: '' });
    deleteRows({ equipment: ['ote'] });
    expect(store.getState().overlays.maintenance.creates).toEqual({});
  });

  it('toModelState 는 들른 국 전부의 effective 상태다 — validateState 에 넣을 수 있다', async () => {
    await store.getState().ensureLoaded('S1');
    store.getState().update('equipment', 'ote', { name: '분전반' });
    const { validateState } = await import('@twin/core');
    expect(validateState(toModelState(store.getState())).map((i) => i.code)).toEqual(['EQUIPMENT_NAME_TAKEN']);
  });

  it('되돌리기(undo)는 오버레이만 되돌린다', async () => {
    await store.getState().ensureLoaded('S1');
    store.getState().update('equipment', 'ote', { note: 'x' });
    store.temporal.getState().undo();
    expect(store.getState().dirtyCount()).toBe(0);
  });

  it('revert 는 오버레이를 비우고 들른 국은 그대로 둔다', async () => {
    await store.getState().ensureLoaded('S1');
    store.getState().update('equipment', 'ote', { note: 'x' });
    store.getState().revert();
    expect(store.getState().dirtyCount()).toBe(0);
    expect(store.getState().loaded).toEqual(['S1']);
  });

  it('삭제 펼침은 되돌리기 한 번에 모두 돌아온다', async () => {
    await store.getState().ensureLoaded('S1');
    deleteRows({ equipment: ['ote'] });
    expect(store.getState().dirtyCount()).toBe(2);
    store.temporal.getState().undo();
    expect(store.getState().dirtyCount()).toBe(0);
  });
});
