import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Workingcopy } from '../types';

const wcOf: Record<string, Workingcopy> = {};
/* 이 저장소는 mockReset 이라 vi.fn 구현이 시험마다 지워진다 — 일반 함수 + 호출 기록을 쓴다. */
const fetched: string[] = [];
/** 읽기에 실패할 국 — 시험이 넣고 뺀다. */
const failing = new Set<string>();
vi.mock('../api', () => ({
  fetchWorkingcopy: async (id: string) => {
    fetched.push(id);
    if (failing.has(id)) throw new Error('네트워크 끊김');
    return structuredClone(wcOf[id]!);
  },
  putCommit: async () => ({}),
}));

import { workingCopyStore as store } from '../store/workingCopy';
import { effectiveCircuits, effectiveRows, bySubstation, toModelState } from '../store/effective';
import { deleteRows } from '../store/deleteActions';
import { buildCommitPayload } from '../store/commitPayload';
import { expandDeletes } from '@twin/core';

const base = (id: string, name: string): Workingcopy => ({
  substation: { id, name }, floors: [], racks: [], equipment: [], links: [], fiberLines: [],
  farLinks: [], refEquipment: [], maintenanceLogs: [], inspectionLogs: [], photos: [],
});

beforeEach(() => {
  fetched.length = 0;
  failing.clear();
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

  it('광선로 다른 끝이 들르지 않은 국의 단자 설비여도 흠이 아니다 — 참조로 안다, 그 국을 들르면 effective 가 정답', async () => {
    const line = {
      id: 'L', cableTypeId: 'opgw', coreCount: 2, name: null, lengthKm: null, segments: [],
      aSubstationId: 'S1', aEquipmentId: null, aPanel: null, aStartNo: 1,
      bSubstationId: 'S2', bEquipmentId: 'far', bPanel: null, bStartNo: 1,
      aSubstationName: '북춘천', bSubstationName: '춘천HP', updatedAt: 'l1', cores: [],
    };
    wcOf.S1.fiberLines = [line];
    wcOf.S1.refEquipment = [{ id: 'far', name: 'OFD', substationId: 'S2' }];
    wcOf.S2.fiberLines = [line];
    const { validateState } = await import('@twin/core');
    const cables = [{ id: 'opgw', medium: 'fiber' }];
    await store.getState().ensureLoaded('S1');
    expect(validateState(toModelState(store.getState(), cables))).toEqual([]);
    /* S2 를 들렀는데 그 설비가 없다(지워졌다) — 참조는 더는 쓰이지 않는다. */
    await store.getState().ensureLoaded('S2');
    expect(validateState(toModelState(store.getState(), cables)).map((i) => i.code)).toEqual(['LINE_END_EQUIPMENT']);
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

  it('국을 못 읽으면 그 국의 까닭을 남기고, 다시 들르면 다시 읽는다', async () => {
    failing.add('S1');
    await store.getState().ensureLoaded('S1');
    expect(store.getState().loaded).toEqual([]);
    expect(store.getState().loading).toBeNull();
    expect(store.getState().loadErrors.S1).toBeTruthy();
    failing.delete('S1');
    await store.getState().ensureLoaded('S1');
    expect(fetched).toEqual(['S1', 'S1']);
    expect(store.getState().loaded).toEqual(['S1']);
    expect(store.getState().loadErrors.S1).toBeUndefined();
  });

  it('reset 은 못 읽은 국의 까닭도 지운다', async () => {
    failing.add('S1');
    await store.getState().ensureLoaded('S1');
    store.getState().reset();
    expect(store.getState().loadErrors).toEqual({});
  });
});

describe('먼 연결 — 들르지 않은 국의, 공유 광선로 코어에 닿은 연결', () => {
  const line = {
    id: 'L', cableTypeId: 'opgw', coreCount: 2, name: null, lengthKm: null, segments: [],
    aSubstationId: 'S1', aEquipmentId: null, aPanel: null, aStartNo: 1,
    bSubstationId: 'S2', bEquipmentId: null, bPanel: null, bStartNo: 1,
    aSubstationName: '북춘천', bSubstationName: '춘천HP', updatedAt: 'l1', cores: [],
  };
  const far = {
    id: 'fk', substationId: 'S2', cableTypeId: null, lengthM: null, spec: null, note: null, pathPoints: [],
    a: { kind: 'core' as const, lineId: 'L', no: 1, side: 'B' as const }, b: { kind: 'equipment' as const, equipmentId: 'ofd2' }, updatedAt: 'fkv',
  };
  beforeEach(() => {
    wcOf.S1.fiberLines = [line];
    wcOf.S1.farLinks = [far];
    wcOf.S1.refEquipment = [{ id: 'ofd2', name: 'OFD', substationId: 'S2' }];
    wcOf.S2.fiberLines = [line];
    wcOf.S2.links = [far];
    wcOf.S2.racks = [{ id: 'r2', substationId: 'S2', name: '랙', rackTypeId: 'rt', floorId: null, x: null, y: null, width: null, height: null, facing: null, updatedAt: 't' }];
    wcOf.S2.equipment = [{ id: 'ofd2', substationId: 'S2', rackId: 'r2', name: 'OFD', typeId: 'et', status: 'normal', model: null, maker: null, madeOn: null, serial: null, installDate: null, manager: null, note: null, circuitCount: 0, panelCount: null, updatedAt: 'e', circuits: [] }];
  });

  it('광선로를 지우면 들르지 않은 국의 먼 연결도 함께 지운다 — 기준 버전도 싣는다', async () => {
    /* 먼 국에서 두 선로 코어를 잇는 점퍼 — 다른 끝의 선로(X)는 모른다. */
    wcOf.S1.farLinks = [far, { ...far, id: 'fk2', updatedAt: 'fk2v', b: { kind: 'core', lineId: 'X', no: 1, side: 'A' } }];
    await store.getState().ensureLoaded('S1');
    const st = store.getState();
    expect(expandDeletes(toModelState(st), { fiberLines: ['L'] }).links.sort()).toEqual(['fk', 'fk2']);
    /* 판정은 먼 연결을 보지 않는다 — 모르는 선로를 가리켜도 거짓 흠이 없다. */
    const { validateState } = await import('@twin/core');
    expect(validateState(toModelState(st, [{ id: 'opgw', medium: 'fiber' }]))).toEqual([]);
    deleteRows({ fiberLines: ['L'] });
    const p = buildCommitPayload(store.getState());
    expect(p.links?.deletes?.sort()).toEqual(['fk', 'fk2']);
    expect(p.fiberLines).toEqual({ deletes: ['L'] });
    expect(p.baseVersions).toEqual({ L: 'l1', fk: 'fkv', fk2: 'fk2v' });
    expect(store.getState().touchedSubstations().sort()).toEqual(['S1', 'S2']);
    /* 이미 지우기로 한 먼 연결은 다시 나오지 않는다. */
    expect(toModelState(store.getState()).outsideLinks).toEqual([]);
  });

  it('그 국을 들르면 그 국 행이 정답이다 — 먼 연결과 겹쳐 둘이 되지 않는다', async () => {
    await store.getState().ensureLoaded('S1');
    await store.getState().ensureLoaded('S2');
    const ms = toModelState(store.getState());
    expect(ms.links.map((l) => l.id)).toContain('fk');
    expect(ms.outsideLinks).toEqual([]);
    expect(expandDeletes(toModelState(store.getState()), { fiberLines: ['L'] }).links).toEqual(['fk']);
  });
});
