import { circuitKey, type LinkEndRef } from '@twin/core';
import type { WorkingCopyState } from './workingCopy';

type S = Pick<WorkingCopyState, 'saved' | 'overlays'>;

/**
 * 설비 하나에 **저장 전 변경**이 있는가 — 변경 이력 탭이 「저장 전 변경은 이력에 없습니다」를 띄울지 정한다.
 * 이력(서버의 ChangeLog)이 싣는 것과 같은 범위: 설비 행·그 차단기·끝이 닿은 연결·기록(점검·고장·사진).
 * `isNew` — 아직 서버에 없는 설비(이력을 물을 곳이 없다).
 */
export function equipmentPending(s: S, equipmentId: string): { pending: boolean; isNew: boolean } {
  const o = s.overlays;
  const isNew = equipmentId in o.equipment.creates;
  const touched = (id: string, ov: { updates: Record<string, unknown>; deletes: string[] }) => id in ov.updates || ov.deletes.includes(id);
  const prefix = circuitKey(equipmentId, 0).slice(0, -1);
  const endOn = (e: LinkEndRef) => (e.kind === 'equipment' || e.kind === 'circuit') && e.equipmentId === equipmentId;

  const pending = isNew
    || touched(equipmentId, o.equipment)
    || Object.keys(o.circuits).some((k) => k.startsWith(prefix))
    || Object.values(o.links.creates).some((l) => endOn(l.a) || endOn(l.b))
    || s.saved.links.some((l) => (endOn(l.a) || endOn(l.b)) && touched(l.id, o.links))
    || (['maintenance', 'inspections', 'photos'] as const).some((k) =>
      Object.values(o[k].creates).some((r) => r.equipmentId === equipmentId)
      || (s.saved[k] as { id: string; equipmentId: string }[]).some((r) => r.equipmentId === equipmentId && touched(r.id, o[k])));
  return { pending, isNew };
}
