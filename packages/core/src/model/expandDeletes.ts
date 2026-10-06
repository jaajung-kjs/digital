import type { LinkEndRef, ModelState } from './types.js';
import type { Side } from './vocab.js';

export interface DeleteRequest { racks?: string[]; equipment?: string[]; fiberLines?: string[]; links?: string[] }

export interface DeletePlan {
  racks: string[];
  equipment: string[];
  fiberLines: string[];
  links: string[];
  /** 지운 설비를 단자로 가리키던 광선로 끝 — 단자 설비·판을 비운다. */
  lineEndClears: { lineId: string; side: Side }[];
  /** 지울 수 없는 것과 그 까닭 — 화면이 그대로 띄운다. */
  blocked: { id: string; reason: string }[];
}

/**
 * 「이것을 지우면 무엇이 함께 가는가」 — **결정적인 한 규칙**.
 *
 * 펼친 결과는 워킹카피에 그대로 들어가 사람 눈에 보이고, 설계서에 철거로 잡힌다. 서버는
 * 이 펼침을 다시 하지 않는다: 남은 참조가 있으면 FK 가 거부한다. 서버가 말없이 연결을
 * 지우면 화면이 보여 준 설계서와 저장된 것이 달라진다.
 *
 * - 설비 → 그 설비·그 설비의 회로에 닿은 연결. 그 설비를 단자로 가리키던 광선로 끝은 비운다.
 * - 광선로 → 그 선로 코어 끝에 닿은 연결(양 끝 국 모두).
 * - 랙 → 안에 남는 설비가 있으면 막는다.
 */
export function expandDeletes(state: ModelState, req: DeleteRequest): DeletePlan {
  const eqGone = new Set(req.equipment ?? []);
  const lineGone = new Set(req.fiberLines ?? []);
  const links = new Set(req.links ?? []);

  const touches = (ref: LinkEndRef): boolean =>
    (ref.kind === 'equipment' && eqGone.has(ref.equipmentId))
    || (ref.kind === 'circuit' && eqGone.has(ref.equipmentId))
    || (ref.kind === 'core' && lineGone.has(ref.lineId));
  for (const l of state.links) if (touches(l.a) || touches(l.b)) links.add(l.id);

  const lineEndClears: DeletePlan['lineEndClears'] = [];
  for (const l of state.fiberLines) {
    if (lineGone.has(l.id)) continue;
    if (l.aEquipmentId !== null && eqGone.has(l.aEquipmentId)) lineEndClears.push({ lineId: l.id, side: 'A' });
    if (l.bEquipmentId !== null && eqGone.has(l.bEquipmentId)) lineEndClears.push({ lineId: l.id, side: 'B' });
  }

  const racks: string[] = [];
  const blocked: DeletePlan['blocked'] = [];
  for (const rackId of req.racks ?? []) {
    const left = state.equipment.filter((e) => e.rackId === rackId && !eqGone.has(e.id)).length;
    if (left > 0) blocked.push({ id: rackId, reason: `랙 안에 설비가 ${left}대 있습니다 — 먼저 옮기거나 지우세요` });
    else racks.push(rackId);
  }

  return { racks, equipment: [...eqGone], fiberLines: [...lineGone], links: [...links], lineEndClears, blocked };
}
