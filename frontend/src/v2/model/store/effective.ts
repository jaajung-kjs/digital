import { circuitKey, coreKey, DEFAULT_CORE_STATUS, rowsForCount, type ModelState } from '@twin/core';
import { mergeEffective, type Overlay } from '../../store/overlay';
import type { Circuit, Core, FiberLine, Link } from '../types';
import type { RowKind, RowOf, WorkingCopyState } from './workingCopy';

type S = Pick<WorkingCopyState, 'saved' | 'overlays'>;

/** 저장본 ⊕ 오버레이 — 한 종류의 effective 행 전부(들른 국 모두). */
export function effectiveRows<K extends RowKind>(s: S, kind: K): RowOf[K][] {
  return mergeEffective(s.saved[kind] as never[], s.overlays[kind] as Overlay<never>) as RowOf[K][];
}

export function bySubstation<T extends { substationId: string }>(rows: T[], substationId: string): T[] {
  return rows.filter((r) => r.substationId === substationId);
}

const blankCircuit = (equipmentId: string, no: number): Circuit => ({
  equipmentId, no, label: null, current: null, voltage: null, capacity: null, phase: null, switch: null, purpose: null, updatedAt: '',
});

/**
 * 설비의 회로 1..N — **회로 수가 근원**이다. 저장된 행이 있으면 그 값, 없으면 빈 행(아직 서버에
 * 없는, 늘린 번호), 그 위에 오버레이 값.
 */
export function effectiveCircuits(s: S, equipmentId: string): Circuit[] {
  const eq = effectiveRows(s, 'equipment').find((e) => e.id === equipmentId);
  if (!eq) return [];
  const savedRows = new Map(s.saved.circuits.filter((c) => c.equipmentId === equipmentId).map((c) => [c.no, c]));
  const { create } = rowsForCount([], eq.circuitCount);
  return create.map((no) => ({ ...(savedRows.get(no) ?? blankCircuit(equipmentId, no)), ...s.overlays.circuits[circuitKey(equipmentId, no)] }));
}

const blankCore = (lineId: string, no: number): Core => ({ lineId, no, status: DEFAULT_CORE_STATUS, role: null, aPurpose: null, aNote: null, bPurpose: null, bNote: null, updatedAt: '' });

export function effectiveCores(s: S, lineId: string): Core[] {
  const line = effectiveRows(s, 'fiberLines').find((l) => l.id === lineId);
  if (!line) return [];
  const savedRows = new Map(s.saved.cores.filter((c) => c.lineId === lineId).map((c) => [c.no, c]));
  return rowsForCount([], line.coreCount).create.map((no) => ({ ...(savedRows.get(no) ?? blankCore(lineId, no)), ...s.overlays.cores[coreKey(lineId, no)] }));
}

/** 그 국에 닿은 광선로(어느 끝이든). */
export function linesTouching(s: S, substationId: string): FiberLine[] {
  return effectiveRows(s, 'fiberLines').filter((l) => l.aSubstationId === substationId || l.bSubstationId === substationId);
}

/** 설비 이름 — 들른 국의 설비, 없으면 대국 참조 설비. */
export function equipmentName(s: S, id: string): string | null {
  return effectiveRows(s, 'equipment').find((e) => e.id === id)?.name
    ?? s.saved.refEquipment.find((e) => e.id === id)?.name ?? null;
}

const linkRow = (l: Link) => ({ id: l.id, substationId: l.substationId, cableTypeId: l.cableTypeId, a: l.a, b: l.b });

/**
 * 들르지 않은 국의 **먼 연결** — 삭제 펼침만 본다(core `outsideLinks`).
 *
 * 공유 광선로를 지우면 그 코어에 닿은 연결은 **양 끝 국 모두** 함께 가야 한다(서버는 Restrict).
 * 들르지 않은 국의 연결은 먼 연결(`farLinks`)로만 아는데, 그것을 빼면 펼침이 그 연결을 놓쳐
 * 서버가 저장을 거절한다. 판정에는 넣지 않는다 — 그 끝이 가리키는 다른 광선로·설비를 다 알지
 * 못해 거짓 흠이 난다(먼 국에서 두 선로 코어를 잇는 점퍼가 실제로 그랬다).
 * 들른 국의 것은 그 국 행이 정답이라 쓰지 않고(겹치지 않게), 이미 지우기로 한 것은 뺀다.
 */
export function outsideLinks(s: S): Link[] {
  const near = new Set(effectiveRows(s, 'links').map((l) => l.id));
  const gone = new Set(s.overlays.links.deletes);
  return s.saved.farLinks.filter((l) => !(l.substationId in s.saved.substations) && !near.has(l.id) && !gone.has(l.id));
}

/** core 판정의 입력 — 들른 국 전부의 effective 상태(+ 삭제 펼침용 먼 연결). */
export function toModelState(s: S & { saved: WorkingCopyState['saved'] }, cableTypes: { id: string; medium: string }[] = []): ModelState {
  return {
    racks: effectiveRows(s, 'racks').map((r) => ({ id: r.id, substationId: r.substationId, name: r.name })),
    equipment: effectiveRows(s, 'equipment').map((e) => ({ id: e.id, substationId: e.substationId, rackId: e.rackId, name: e.name, circuitCount: e.circuitCount, panelCount: e.panelCount })),
    fiberLines: effectiveRows(s, 'fiberLines').map((l) => ({
      id: l.id, cableTypeId: l.cableTypeId, coreCount: l.coreCount,
      aSubstationId: l.aSubstationId, aEquipmentId: l.aEquipmentId, bSubstationId: l.bSubstationId, bEquipmentId: l.bEquipmentId,
      aPanel: l.aPanel, aStartNo: l.aStartNo, bPanel: l.bPanel, bStartNo: l.bStartNo,
    })),
    links: effectiveRows(s, 'links').map(linkRow),
    outsideLinks: outsideLinks(s).map(linkRow),
    cableTypes,
    /* 들르지 않은 국의 단자 설비(광선로 다른 끝)는 참조로만 안다 — 안 실으면 「없는 설비」로 잘못 판정된다.
       들른 국의 설비는 effective 행이 정답이라(지운 것 포함) 참조를 쓰지 않는다. */
    outsideEquipment: s.saved.refEquipment
      .filter((e) => !(e.substationId in s.saved.substations))
      .map((e) => ({ id: e.id, substationId: e.substationId })),
  };
}

/**
 * 국 이름 — 들른 국은 그 국 행, 들르지 않은 국은 **광선로가 싣고 온 끝 국 이름**(저장된 것은 지우기로 한 것까지, 새로 만든 것까지).
 * 저장 바가 「변경이 닿은 국」을 적을 때 id 를 그대로 띄우지 않게 — 측정·코어 값·광선로 지우기는 들르지 않은 상대 국을 건드린다.
 * 그래도 모르면 null(부르는 쪽이 정한다).
 */
export function substationName(s: S, id: string): string | null {
  const own = s.saved.substations[id]?.name;
  if (own) return own;
  for (const l of [...s.saved.fiberLines, ...Object.values(s.overlays.fiberLines.creates)]) {
    if (l.aSubstationId === id) return l.aSubstationName;
    if (l.bSubstationId === id) return l.bSubstationName;
  }
  return null;
}
