import { endRefKey, type LinkEndRef, type LinkRow, type ModelIssue, type ModelState } from './types.js';
import { isLineMedium, isLinkMedium } from './vocab.js';

/**
 * 설비 모델의 **최종 상태**가 맞는가 — 판정의 유일한 자리.
 *
 * 서버는 커밋을 다 적용한 뒤 건드린 국의 상태를 실어 이것을 부르고, 프론트는 워킹카피의
 * effective 상태로 같은 것을 부른다. 중간 상태는 묻지 않는다: 랙을 바꾸며 이름을 맞바꾸는
 * 일처럼 한 커밋 안의 순서가 어긋나면 늘 걸리는 검사가 생긴다.
 *
 * 이름 겹침(①)과 끝 하나에 연결 하나(⑤)는 DB 유일 제약으로도 막지만, 화면이 저장 전에
 * 보여 주려면 여기에도 있어야 한다 — 같은 규칙을 두 군데 **적는** 것이 아니라 DB 는 마지막
 * 그물이다.
 */
export function validateState(state: ModelState): ModelIssue[] {
  const issues: ModelIssue[] = [];
  const rackById = new Map(state.racks.map((r) => [r.id, r]));
  const eqById = new Map(state.equipment.map((e) => [e.id, e]));
  const lineById = new Map(state.fiberLines.map((l) => [l.id, l]));
  const mediumOf = new Map(state.cableTypes.map((c) => [c.id, c.medium]));

  // ① 이름 — 국 안에서 랙끼리, 설비끼리 유일(이름 공간은 따로다).
  for (const [list, code, what] of [
    [state.racks, 'RACK_NAME_TAKEN', '랙'],
    [state.equipment, 'EQUIPMENT_NAME_TAKEN', '설비'],
  ] as const) {
    const seen = new Map<string, string[]>();
    for (const row of list) {
      const k = `${row.substationId}\u0000${row.name}`;
      seen.set(k, [...(seen.get(k) ?? []), row.id]);
    }
    for (const [k, ids] of seen) {
      if (ids.length > 1) {
        issues.push({ code, message: `같은 국에 ${what} 이름 「${k.split('\u0000')[1]}」이 ${ids.length}개 있습니다`, ids });
      }
    }
  }

  // ② 설비의 랙은 같은 국.
  for (const e of state.equipment) {
    const rack = rackById.get(e.rackId);
    if (!rack || rack.substationId !== e.substationId) {
      issues.push({ code: 'EQUIPMENT_RACK_INVALID', message: `설비 「${e.name}」의 랙이 같은 국에 없습니다`, ids: [e.id] });
    }
  }

  // ③ 연결의 끝은 연결의 국 안에서 끝난다.
  const endValid = (link: LinkRow, ref: LinkEndRef): boolean => {
    switch (ref.kind) {
      case 'equipment': {
        const e = eqById.get(ref.equipmentId);
        return !!e && e.substationId === link.substationId;
      }
      case 'circuit': {
        const e = eqById.get(ref.equipmentId);
        return !!e && e.substationId === link.substationId && Number.isInteger(ref.no) && ref.no >= 1 && ref.no <= e.circuitCount;
      }
      case 'core': {
        const l = lineById.get(ref.lineId);
        if (!l || !Number.isInteger(ref.no) || ref.no < 1 || ref.no > l.coreCount) return false;
        return (ref.side === 'A' ? l.aSubstationId : l.bSubstationId) === link.substationId;
      }
    }
  };
  // ⑤ 회로 끝·코어 끝은 연결 하나.
  const takenBy = new Map<string, string[]>();
  for (const link of state.links) {
    for (const ref of [link.a, link.b]) {
      if (!endValid(link, ref)) {
        issues.push({ code: 'LINK_END_INVALID', message: '연결의 끝이 이 국의 설비·회로·코어 끝이 아닙니다', ids: [link.id] });
      }
      if (ref.kind !== 'equipment') {
        const k = endRefKey(ref);
        takenBy.set(k, [...(takenBy.get(k) ?? []), link.id]);
      }
    }
    // ⑧ 두 끝이 같은 대상.
    if (endRefKey(link.a) === endRefKey(link.b)) {
      issues.push({ code: 'LINK_SELF', message: '연결의 두 끝이 같습니다', ids: [link.id] });
    }
    // ⑥ 국 내 연결의 매체.
    if (link.cableTypeId !== null && !isLinkMedium(mediumOf.get(link.cableTypeId) ?? '')) {
      issues.push({ code: 'LINK_MEDIUM', message: '국 내 연결에 쓸 수 없는 케이블 종류입니다', ids: [link.id] });
    }
  }
  for (const ids of takenBy.values()) {
    if (ids.length > 1) issues.push({ code: 'LINK_END_TAKEN', message: '한 회로·코어 끝에 연결이 둘 이상입니다', ids });
  }

  for (const l of state.fiberLines) {
    // ⑥ 광선로의 매체.
    if (!isLineMedium(mediumOf.get(l.cableTypeId) ?? '')) {
      issues.push({ code: 'LINE_MEDIUM', message: '광선로에 쓸 수 없는 케이블 종류입니다', ids: [l.id] });
    }
    if (!Number.isInteger(l.coreCount) || l.coreCount < 1) {
      issues.push({ code: 'LINE_CORE_COUNT', message: '코어 수는 1 이상이어야 합니다', ids: [l.id] });
    }
    // ⑦ 단자 설비는 그 끝의 국 설비.
    for (const [eqId, subId] of [[l.aEquipmentId, l.aSubstationId], [l.bEquipmentId, l.bSubstationId]] as const) {
      if (eqId === null) continue;
      const e = eqById.get(eqId);
      if (!e || e.substationId !== subId) {
        issues.push({ code: 'LINE_END_EQUIPMENT', message: '광선로 끝의 단자 설비가 그 끝의 국에 없습니다', ids: [l.id] });
      }
    }
  }
  return issues;
}
