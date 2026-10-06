import { expandDeletes, type DeleteRequest } from '@twin/core';
import { stageDelete, stageUpdate, type Overlay } from '../../store/overlay';
import { toModelState } from './effective';
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
