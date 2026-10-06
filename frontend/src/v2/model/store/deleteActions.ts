import { expandDeletes, sameEndRef, type DeleteRequest } from '@twin/core';
import { stageDelete, stageUpdate, type Overlay } from '../../store/overlay';
import { effectiveRows, toModelState } from './effective';
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

/** 딸려 가는 것이 없는 행 — 기록·사진, 그리고 층(랙이 놓인 층은 화면이 먼저 막는다). */
export type LeafRowKind = Extract<RowKind, 'floors' | 'maintenance' | 'inspections' | 'photos'>;

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
 * 그 차단기에 연결이 남아 있으면 **아무것도 바꾸지 않고** 까닭을 돌려준다(core 규칙: 연결의 차단기 끝은
 * 차단기 수 안에 있어야 한다 — `validateState` LINK_END_INVALID). 연결을 말없이 함께 지우지 않는다:
 * 부하가 어디서 전원을 받는지가 사라지는 일이라 사람이 먼저 지워야 한다.
 */
export function removeLastCircuit(equipmentId: string): { blocked: string | null } {
  const s = workingCopyStore.getState();
  const eq = effectiveRows(s, 'equipment').find((e) => e.id === equipmentId);
  if (!eq || eq.circuitCount === 0) return { blocked: null };
  const no = eq.circuitCount;
  const ref = { kind: 'circuit', equipmentId, no } as const;
  if (effectiveRows(s, 'links').some((l) => sameEndRef(l.a, ref) || sameEndRef(l.b, ref))) {
    return { blocked: `차단기 ${no} 에 연결이 있어 지울 수 없습니다 — 연결을 먼저 지우세요` };
  }
  s.update('equipment', equipmentId, { circuitCount: no - 1 });
  return { blocked: null };
}
