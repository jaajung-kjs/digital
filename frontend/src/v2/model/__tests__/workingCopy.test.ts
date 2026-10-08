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
import { addCircuit, deleteRows, removeLastCircuit } from '../store/deleteActions';
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

  it('참조 광선로(refLines)는 국을 들를 때마다 id 로 합친다 — 옛 응답(필드 없음)은 빈 것', async () => {
    wcOf.S1.refLines = [{ id: 'LX', name: null, aSubstationName: '춘천HP', bSubstationName: '화천' }];
    wcOf.S2.refLines = [
      { id: 'LX', name: '고친이름', aSubstationName: '춘천HP', bSubstationName: '화천' },
      { id: 'LY', name: 'Y선로', aSubstationName: '화천', bSubstationName: '양구' },
    ];
    await store.getState().ensureLoaded('S1');
    expect(store.getState().saved.refLines).toEqual(wcOf.S1.refLines);
    await store.getState().ensureLoaded('S2');
    expect(store.getState().saved.refLines.map((l) => [l.id, l.name])).toEqual([['LX', '고친이름'], ['LY', 'Y선로']]);
    delete wcOf.S1.refLines;
    store.getState().reset();
    await store.getState().ensureLoaded('S1');
    expect(store.getState().saved.refLines).toEqual([]);
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

/* 제자리로 돌아온 손질은 변경이 아니다 — 차단기를 하나 더했다 지우면 저장할 것이 없어야 한다. */
describe('제자리로 돌아온 고치기는 걷힌다', () => {
  it('차단기를 더했다 지우면 변경 0건, 되돌리기는 그대로 듣는다', async () => {
    await store.getState().ensureLoaded('S1');
    store.temporal.getState().clear();
    expect(addCircuit('pnl')).toBe(3);
    store.getState().updateCircuit('pnl', 3, { label: 'CB3' });
    expect(store.getState().dirtyCount()).toBe(2);
    expect(removeLastCircuit('pnl')).toEqual({ blocked: null });
    expect(store.getState().overlays.equipment.updates).toEqual({});
    expect(store.getState().overlays.circuits).toEqual({});
    expect(store.getState().dirtyCount()).toBe(0);

    store.temporal.getState().undo();
    expect(effectiveRows(store.getState(), 'equipment').find((e) => e.id === 'pnl')?.circuitCount).toBe(3);
    expect(store.getState().dirtyCount()).toBe(2);
  });

  it('차단기 추가에 처음 값을 주면 그 값으로 서고 — 되돌리기 한 번에 수와 값이 함께 물러난다', async () => {
    await store.getState().ensureLoaded('S1');
    store.temporal.getState().clear();
    expect(addCircuit('pnl', { current: 'DC' })).toBe(3);
    expect(effectiveCircuits(store.getState(), 'pnl').find((c) => c.no === 3)).toMatchObject({ current: 'DC', label: null });
    store.temporal.getState().undo();
    expect(effectiveRows(store.getState(), 'equipment').find((e) => e.id === 'pnl')?.circuitCount).toBe(2);
    expect(store.getState().overlays.circuits).toEqual({});
  });

  it('다른 칸은 남기고 제자리로 돌아온 칸만 걷는다', async () => {
    await store.getState().ensureLoaded('S1');
    store.getState().update('equipment', 'ote', { note: '메모', name: '바꿈' });
    store.getState().update('equipment', 'ote', { name: '송광치' });
    expect(store.getState().overlays.equipment.updates).toEqual({ ote: { note: '메모' } });
  });
});

describe('코어 고치기 — 제자리로 돌아오면 걷히고, 저장에 안 실릴 것은 세지 않는다', () => {
  const lineWith = () => ({
    id: 'L', cableTypeId: 'opgw', coreCount: 2, name: null, lengthKm: null, segments: [],
    aSubstationId: 'S1', aEquipmentId: null, aPanel: null, aStartNo: 1,
    bSubstationId: 'S2', bEquipmentId: null, bPanel: null, bStartNo: 1,
    aSubstationName: '북춘천', bSubstationName: '춘천HP', updatedAt: 'l1',
    cores: [{ lineId: 'L', no: 1, status: 'ok', role: 'main', aPurpose: 'PTP', aNote: null, bPurpose: null, bNote: null, updatedAt: 'c1', measurements: [] }],
  });

  it('저장된 값으로 되돌린 칸은 걷히고, 다 걷히면 그 코어의 고치기가 사라진다(변경 0건)', async () => {
    wcOf.S1.fiberLines = [lineWith()] as never;
    await store.getState().ensureLoaded('S1');
    const s = store.getState();
    s.updateCore('L', 1, { aPurpose: '바꿈', aNote: '메모' });
    expect(store.getState().dirtyCount()).toBe(1);
    s.updateCore('L', 1, { aPurpose: 'PTP' });
    expect(store.getState().overlays.cores).toEqual({ 'core:L:1': { aNote: '메모' } });
    s.updateCore('L', 1, { aNote: null });
    expect(store.getState().overlays.cores).toEqual({});
    expect(store.getState().dirtyCount()).toBe(0);
  });

  it('저장된 행이 없는 코어는 빈 코어가 기준 — 상태를 바꿨다 정상으로 돌리면 걷힌다', async () => {
    wcOf.S1.fiberLines = [lineWith()] as never;
    await store.getState().ensureLoaded('S1');
    store.getState().updateCore('L', 2, { status: 'broken' });
    expect(store.getState().dirtyCount()).toBe(1);
    store.getState().updateCore('L', 2, { status: 'ok' });
    expect(store.getState().dirtyCount()).toBe(0);
  });

  it('지우기로 한 광선로의 코어 고치기는 세지 않는다 — 되돌리면 다시 센다', async () => {
    wcOf.S1.fiberLines = [lineWith()] as never;
    await store.getState().ensureLoaded('S1');
    store.temporal.getState().clear();
    store.getState().updateCore('L', 1, { aNote: '메모' });
    expect(store.getState().dirtyCount()).toBe(1);
    expect(deleteRows({ fiberLines: ['L'] })).toEqual({ blocked: [] });
    /* 광선로 지우기 1건만 — 사라질 코어 값은 저장에 실리지 않으므로 세지 않는다. */
    expect(store.getState().dirtyCount()).toBe(1);
    expect(buildCommitPayload(store.getState()).cores).toBeUndefined();
    store.temporal.getState().undo();
    expect(store.getState().dirtyCount()).toBe(1);
    expect(store.getState().overlays.cores['core:L:1']).toEqual({ aNote: '메모' });
  });

  it('지우기로 한 설비의 차단기 고치기도 세지 않는다', async () => {
    await store.getState().ensureLoaded('S1');
    store.getState().updateCircuit('pnl', 2, { label: 'CB2' });
    expect(store.getState().dirtyCount()).toBe(1);
    deleteRows({ equipment: ['pnl'] });
    const o = store.getState().overlays;
    /* 설비 지우기 + 그 차단기에 닿은 연결 지우기 — 차단기 값은 세지 않는다. */
    expect(store.getState().dirtyCount()).toBe(o.equipment.deletes.length + o.links.deletes.length);
  });
});

describe('고쳤다 되돌리면 변경 0건 — 차단기 값·연결 포트', () => {
  it('저장된 차단기 값을 고쳤다 되돌리면 걷힌다(dirtyCount 0)', async () => {
    await store.getState().ensureLoaded('S1');
    store.getState().updateCircuit('pnl', 1, { label: 'CB1Z' });
    expect(store.getState().dirtyCount()).toBe(1);
    store.getState().updateCircuit('pnl', 1, { label: 'CB1' });
    expect(store.getState().overlays.circuits).toEqual({});
    expect(store.getState().dirtyCount()).toBe(0);
  });

  it('「차단기 추가」가 저장된 옛 번호를 빈 값으로 덮은 키는 접지 않는다 — 옛 값이 되살아나지 않는다', async () => {
    wcOf.S1.equipment[0]!.circuits[1]!.label = 'OLD2';
    await store.getState().ensureLoaded('S1');
    expect(removeLastCircuit('pnl')).toEqual({ blocked: null });
    expect(addCircuit('pnl')).toBe(2);
    expect(store.getState().overlays.blankCircuits).toEqual({ 'circuit:pnl:2': true });
    store.getState().updateCircuit('pnl', 2, { label: 'OLD2' });
    store.getState().updateCircuit('pnl', 2, { label: null });
    /* 덮개는 남는다 — 저장하면 옛 값을 지운다. */
    expect(effectiveCircuits(store.getState(), 'pnl').find((c) => c.no === 2)?.label).toBeNull();
    expect(store.getState().overlays.circuits['circuit:pnl:2']).toMatchObject({ label: null, current: null });
    /* 다시 지우면 표시도 함께 걷힌다. */
    expect(removeLastCircuit('pnl')).toEqual({ blocked: null });
    expect(store.getState().overlays.blankCircuits).toEqual({});
  });

  it('연결 포트를 고쳤다 되돌리면 걷힌다(dirtyCount 0)', async () => {
    await store.getState().ensureLoaded('S1');
    const k1 = () => effectiveRows(store.getState(), 'links').find((l) => l.id === 'k1')!;
    const ref = k1().b;
    store.getState().update('links', 'k1', { b: { ...ref, label: 'AC IN' } as never });
    expect(store.getState().dirtyCount()).toBe(1);
    expect(buildCommitPayload(store.getState()).links?.updates?.[0]?.patch).toEqual({ bLabel: 'AC IN' });
    store.getState().update('links', 'k1', { b: { ...k1().b, label: null } as never });
    expect(store.getState().dirtyCount()).toBe(0);
  });
});

describe('새로 읽기 · 충돌 뒤 다시 맞추기 · 주인', () => {
  it('새로 읽는 동안 들른 국도 새 기준에 남는다(경합) — 국들은 함께 읽는다', async () => {
    await store.getState().ensureLoaded('S1');
    const p = store.getState().refresh();
    /* refresh 가 S1 을 읽는 동안 S2 를 들른다. */
    await store.getState().ensureLoaded('S2');
    await p;
    const st = store.getState();
    expect(st.loaded.sort()).toEqual(['S1', 'S2']);
    expect(st.saved.substations.S2?.name).toBe('춘천HP');
    expect(st.saved.racks.map((r) => r.id)).toEqual(['r1']);
  });

  it('충돌 키의 손질만 버리고 나머지 변경은 남긴다 — 서버의 새 값을 기준으로', async () => {
    await store.getState().ensureLoaded('S1');
    await store.getState().ensureLoaded('S2');
    store.getState().update('equipment', 'ote', { note: '내 메모' });
    store.getState().update('racks', 'r1', { name: '내 랙 이름' });
    store.getState().updateCircuit('pnl', 1, { label: 'CB1Z' });
    store.getState().create('racks', { id: 'r9', substationId: 'S2', name: '새 랙', rackTypeId: 'rt', floorId: null, x: null, y: null, width: null, height: null, facing: null, updatedAt: '' });
    /* 그사이 다른 사람이 랙 이름과 차단기 1 을 고쳐 저장했다. */
    wcOf.S1.racks[0] = { ...wcOf.S1.racks[0]!, name: '남의 이름', updatedAt: 't9' };
    wcOf.S1.equipment[0]!.circuits[0] = { ...wcOf.S1.equipment[0]!.circuits[0]!, label: '남의 CB', updatedAt: 'c9' };
    const dropped = await store.getState().rebase([
      { key: 'r1', reason: 'modified', serverUpdatedAt: 't9' },
      { key: 'circuit:pnl:1', reason: 'modified', serverUpdatedAt: 'c9' },
    ]);
    expect(dropped.map((d) => d.key).sort()).toEqual(['circuit:pnl:1', 'r1']);
    const st = store.getState();
    expect(st.dirtyCount()).toBe(2);
    expect(effectiveRows(st, 'racks').find((r) => r.id === 'r1')?.name).toBe('남의 이름');
    expect(effectiveRows(st, 'equipment').find((e) => e.id === 'ote')?.note).toBe('내 메모');
    expect(effectiveCircuits(st, 'pnl')[0]?.label).toBe('남의 CB');
    expect(st.baseVersions.r1).toBe('t9');
    /* 되돌리기로 버린 손질이 되살아나지 않는다. */
    expect(store.temporal.getState().pastStates).toHaveLength(0);
  });

  it('서버에서 지워진 설비 — 그 고치기와, 그 설비에 단 저장 안 된 기록도 버린다', async () => {
    await store.getState().ensureLoaded('S1');
    store.getState().update('equipment', 'ote', { note: '내 메모' });
    store.getState().create('maintenance', { id: 'm9', equipmentId: 'ote', occurredAt: '2026-10-01', content: '고장', action: null, updatedAt: '' });
    wcOf.S1.equipment = wcOf.S1.equipment.filter((e) => e.id !== 'ote');
    wcOf.S1.links = [];
    const dropped = await store.getState().rebase([{ key: 'ote', reason: 'deleted' }]);
    expect(dropped).toEqual([
      { key: 'ote', kind: 'equipment', reason: 'conflict' },
      { key: 'm9', kind: 'maintenance', reason: 'orphan' },
    ]);
    expect(store.getState().dirtyCount()).toBe(0);
  });

  it('다른 사용자가 들어오면 변경안을 비운다 — 같은 사람이면 이어서 쓴다', async () => {
    store.getState().claim('u1');
    await store.getState().ensureLoaded('S1');
    store.getState().update('equipment', 'ote', { note: '메모' });
    store.getState().claim('u1');
    expect(store.getState().dirtyCount()).toBe(1);
    store.getState().claim('u2');
    expect(store.getState().dirtyCount()).toBe(0);
    expect(store.getState().loaded).toEqual([]);
    expect(store.getState().owner).toBe('u2');
  });
});
