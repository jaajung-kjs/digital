import { expandDeletes, type DeleteRequest } from '@twin/core';
import { effectiveRows, toModelState } from './effective';
import { workingCopyStore } from './workingCopy';

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
  for (const id of plan.links) s.remove('links', id);
  for (const id of plan.fiberLines) s.remove('fiberLines', id);
  for (const c of plan.lineEndClears) {
    s.update('fiberLines', c.lineId, c.side === 'A' ? { aEquipmentId: null, aPanel: null } : { bEquipmentId: null, bPanel: null });
  }
  for (const k of ['maintenance', 'inspections', 'photos'] as const) {
    for (const r of effectiveRows(s, k)) if (eqGone.has(r.equipmentId) && r.id in workingCopyStore.getState().overlays[k].creates) s.remove(k, r.id);
  }
  for (const id of plan.equipment) s.remove('equipment', id);
  for (const id of plan.racks) s.remove('racks', id);
  return { blocked: [] };
}
