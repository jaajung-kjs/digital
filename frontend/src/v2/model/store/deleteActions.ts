import { MAX_CIRCUITS, circuitKey, coreKey, expandDeletes, validateState, type DeleteRequest } from '@twin/core';
import type { FiberLine } from '../types';
import { stageDelete, stageUpdate, type Overlay } from '../../store/overlay';
import { effectiveRows, outsideLinks, toModelState } from './effective';
import { workingCopyStore, type RowKind } from './workingCopy';

/**
 * 지우기 — **함께 가는 것까지 펼쳐서** 오버레이에 싣는다(`expandDeletes`). 막힌 것이 하나라도
 * 있으면 아무것도 바꾸지 않고 그 까닭을 돌려준다(화면이 띄운다).
 *
 * 지운 설비의 **저장 안 된** 기록·사진 만들기는 함께 걷는다. 저장된 기록·사진은 서버가 설비와
 * 함께 지운다 — 여기서 따로 지우라고 보내면 서버가 「없는 대상」으로 거절한다.
 */
export function deleteRows(req: DeleteRequest): { blocked: { id: string; reason: string }[] } {
  const s = workingCopyStore.getState();
  const plan = expandDeletes(toModelState(s), req);
  if (plan.blocked.length > 0) return { blocked: plan.blocked };
  const eqGone = new Set(plan.equipment);
  const lineGone = new Set(plan.fiberLines);
  /* 한 번의 set — 되돌리기 한 번에 설비와 그 연결이 함께 돌아온다. */
  s.applyOverlays((o0) => {
    let o = { ...o0 };
    const del = <K extends RowKind>(k: K, id: string) => { o = { ...o, [k]: stageDelete(o[k] as Overlay<unknown>, id) }; };
    for (const id of plan.links) del('links', id);
    for (const id of plan.fiberLines) del('fiberLines', id);
    for (const c of plan.lineEndClears) {
      const patch = c.side === 'A' ? { aEquipmentId: null, aPanel: null } : { bEquipmentId: null, bPanel: null };
      o = { ...o, fiberLines: stageUpdate(o.fiberLines, c.lineId, patch) };
    }
    for (const k of ['maintenance', 'inspections', 'photos'] as const) {
      for (const r of Object.values(o[k].creates)) if (eqGone.has(r.equipmentId)) del(k, r.id);
    }
    for (const m of Object.values(o.coreMeasurements.creates)) if (lineGone.has(m.lineId)) del('coreMeasurements', m.id);
    for (const id of plan.equipment) del('equipment', id);
    for (const id of plan.racks) del('racks', id);
    return o;
  });
  return { blocked: [] };
}

/** 딸려 가는 것이 없는 행 — 기록·사진·코어 측정, 그리고 층(랙이 놓인 층은 화면이 먼저 막는다). */
export type LeafRowKind = Extract<RowKind, 'floors' | 'maintenance' | 'inspections' | 'photos' | 'coreMeasurements'>;

/**
 * 한 행만 지운다 — **지우는 문은 이 파일 하나다**(`deleteRows` 와 같은 자리). 화면이 스토어의
 * `remove` 를 직접 부르면, 언젠가 딸려 가야 할 것이 생겼을 때 그 화면만 펼치기를 건너뛴다.
 */
export function deleteLeafRow(kind: LeafRowKind, id: string): void {
  workingCopyStore.getState().remove(kind, id);
}

/**
 * 마지막 차단기 지우기 — 차단기 수를 하나 줄인다. 차단기는 수로만 생기므로 지울 수 있는 것은 늘 끝 번호다.
 *
 * 판정은 core 한 곳(`validateState`)이다: 수를 하나 줄인 상태에서 **새로** 「끝이 없는 연결」(LINK_END_INVALID)이
 * 생기면 그 차단기에 연결이 남아 있는 것이다 — 그때는 **아무것도 바꾸지 않고** 까닭을 돌려준다. 이미 있던 흠은
 * 이 지우기의 탓이 아니므로 빼고 본다(잇기 미리 보기와 같은 어법). 연결을 말없이 함께 지우지 않는다:
 * 부하가 어디서 전원을 받는지가 사라지는 일이라 사람이 먼저 지워야 한다.
 */
export function removeLastCircuit(equipmentId: string): { blocked: string | null } {
  const s = workingCopyStore.getState();
  const eq = effectiveRows(s, 'equipment').find((e) => e.id === equipmentId);
  if (!eq || eq.circuitCount === 0) return { blocked: null };
  const no = eq.circuitCount;
  const now = toModelState(s);
  const next = { ...now, equipment: now.equipment.map((e) => (e.id === equipmentId ? { ...e, circuitCount: no - 1 } : e)) };
  const dangling = (m: typeof now) => validateState(m).filter((i) => i.code === 'LINK_END_INVALID').flatMap((i) => i.ids);
  const before = new Set(dangling(now));
  if (dangling(next).some((id) => !before.has(id))) {
    return { blocked: `차단기 ${no} 에 연결이 있어 지울 수 없습니다 — 연결을 먼저 지우세요` };
  }
  /* 수를 줄이는 일과 그 번호에 고쳐 두던 값을 걷는 일을 **한 번의 set** 으로 — 남겨 두면 보이지 않는
     차단기의 값이 변경 1건으로 남는다(되돌리기 한 번에 함께 돌아온다). */
  const k = circuitKey(equipmentId, no);
  s.applyOverlays((o) => {
    const { [k]: _gone, ...circuits } = o.circuits;
    return { ...o, equipment: stageUpdate(o.equipment, equipmentId, { circuitCount: no - 1 }, savedEquipment(equipmentId)), circuits };
  });
  return { blocked: null };
}

/**
 * 차단기 한 줄 더하기 — 끝 번호 n 으로 생긴다. **새 줄은 빈 줄이다**: 예전에 n 번이 있다가 지워졌으면
 * 그때 저장된 값(saved 행)이나 고치던 값(오버레이)이 되살아나면 안 된다. 그래서 수를 늘리는 일과
 * n 번 값을 비우는 일을 **한 번의 set** 으로 싣는다 — 되돌리기 한 번에 함께 물러난다.
 * 저장된 n 번 행이 있으면 모든 칸을 null 로 덮고, 없으면 남은 오버레이만 걷는다(빈 패치를 싣지 않는다).
 */
export function addCircuit(equipmentId: string): number | null {
  const s = workingCopyStore.getState();
  const eq = effectiveRows(s, 'equipment').find((e) => e.id === equipmentId);
  if (!eq || eq.circuitCount >= MAX_CIRCUITS) return null;
  const no = eq.circuitCount + 1;
  const k = circuitKey(equipmentId, no);
  const hasSaved = s.saved.circuits.some((c) => c.equipmentId === equipmentId && c.no === no);
  s.applyOverlays((o) => {
    const { [k]: _old, ...rest } = o.circuits;
    const circuits = hasSaved
      ? { ...rest, [k]: { label: null, current: null, voltage: null, capacity: null, phase: null, switch: null, purpose: null } }
      : rest;
    return { ...o, equipment: stageUpdate(o.equipment, equipmentId, { circuitCount: no }, savedEquipment(equipmentId)), circuits };
  });
  return no;
}

function savedEquipment(id: string) {
  return workingCopyStore.getState().saved.equipment.find((e) => e.id === id);
}

/**
 * 광선로를 지우면 함께 가는 것 — 확인 문구의 수(코어 · 측정 · 연결). 연결은 `expandDeletes` 가 펼친 그대로
 * (양 끝 국 모두, 들르지 않은 국의 먼 연결 포함)이고, 코어·측정은 그 선로의 effective 행이다.
 */
export function lineDeleteSummary(lineId: string): { cores: number; measurements: number; links: number } {
  const s = workingCopyStore.getState();
  const line = effectiveRows(s, 'fiberLines').find((l) => l.id === lineId);
  const plan = expandDeletes(toModelState(s), { fiberLines: [lineId] });
  return {
    cores: line?.coreCount ?? 0,
    measurements: effectiveRows(s, 'coreMeasurements').filter((m) => m.lineId === lineId).length,
    links: plan.links.length,
  };
}

/**
 * 코어 수를 `count` 로 줄이면 잘려 나갈 코어 중 **연결·측정이 있는 것** — 없으면 null, 있으면 까닭.
 *
 * 연결은 core `validateState` 가 판정한다: 줄인 상태에서 **새로** 「끝이 없는 연결」이 생기면 그 끝의 코어가
 * 잘린다(차단기 지우기와 같은 어법). 판정은 들르지 않은 국의 먼 연결을 보지 않으므로 그것은 끝 번호로 더하고,
 * 측정은 판정 입력에 없으므로 코어 번호로 본다 — 서버(`syncCores`)도 같은 둘을 세어 거절한다.
 */
export function lineShrinkBlock(lineId: string, count: number): string | null {
  const s = workingCopyStore.getState();
  const line = effectiveRows(s, 'fiberLines').find((l) => l.id === lineId);
  if (!line || count >= line.coreCount) return null;
  const now = toModelState(s);
  const next = { ...now, fiberLines: now.fiberLines.map((l) => (l.id === lineId ? { ...l, coreCount: count } : l)) };
  const dangling = (m: typeof now) => validateState(m).filter((i) => i.code === 'LINK_END_INVALID').flatMap((i) => i.ids);
  const before = new Set(dangling(now));
  const cut = new Set(dangling(next).filter((id) => !before.has(id)));
  const used = new Set<number>();
  for (const l of [...effectiveRows(s, 'links').filter((x) => cut.has(x.id)), ...outsideLinks(s)]) {
    for (const ref of [l.a, l.b]) if (ref.kind === 'core' && ref.lineId === lineId && ref.no > count) used.add(ref.no);
  }
  for (const m of effectiveRows(s, 'coreMeasurements')) if (m.lineId === lineId && m.coreNo > count) used.add(m.coreNo);
  if (used.size === 0) return null;
  return `코어 ${coreRuns([...used])} 에 연결·측정이 있어 줄일 수 없습니다`;
}

/**
 * 코어 번호 목록을 읽을 수 있게 — 셋 이상 이어지면 `15–20`, 그 밖은 하나씩(`3, 4, 13, 15–20`).
 * 범위 하나(`3–20`)로 뭉치면 사이의 빈 코어까지 막힌 것처럼 읽힌다. 덩어리가 많으면 앞 `max` 개만 적고 남은 코어 수를 붙인다.
 */
export function coreRuns(nos: number[], max = 5): string {
  const sorted = [...new Set(nos)].sort((a, b) => a - b);
  const runs: number[][] = [];
  for (const n of sorted) {
    const last = runs[runs.length - 1];
    if (last && n === last[last.length - 1]! + 1) last.push(n);
    else runs.push([n]);
  }
  const parts = runs.flatMap((r) => (r.length >= 3 ? [`${r[0]}–${r[r.length - 1]}`] : r.map(String)));
  if (parts.length <= max) return parts.join(', ');
  const shown = parts.slice(0, max);
  const shownCount = shown.reduce((n, p) => n + (p.includes('–') ? Number(p.split('–')[1]) - Number(p.split('–')[0]) + 1 : 1), 0);
  return `${shown.join(', ')} 외 ${sorted.length - shownCount}개`;
}

/**
 * 광선로 고치기 — 코어 수를 줄이면 먼저 `lineShrinkBlock` 으로 묻고, 막히면 **아무것도 바꾸지 않고** 까닭을 돌려준다.
 * 줄이는 일과 잘린 코어에 고쳐 두던 값을 걷는 일은 **한 번의 set**(되돌리기 한 번에 함께 돌아온다) —
 * 남겨 두면 보이지 않는 코어의 값이 변경 1건으로 남는다.
 */
export function updateFiberLine(lineId: string, patch: Partial<FiberLine>): { blocked: string | null } {
  const s = workingCopyStore.getState();
  const line = effectiveRows(s, 'fiberLines').find((l) => l.id === lineId);
  if (!line) return { blocked: null };
  const count = patch.coreCount ?? line.coreCount;
  const blocked = lineShrinkBlock(lineId, count);
  if (blocked) return { blocked };
  const base = s.saved.fiberLines.find((l) => l.id === lineId);
  const gone = new Set(Array.from({ length: Math.max(0, line.coreCount - count) }, (_, i) => coreKey(lineId, count + 1 + i)));
  s.applyOverlays((o) => {
    const cores = Object.fromEntries(Object.entries(o.cores).filter(([k]) => !gone.has(k)));
    return { ...o, fiberLines: stageUpdate(o.fiberLines, lineId, patch, base), cores };
  });
  return { blocked: null };
}
