import { powerLedger, type CurrentFilter, type PowerInput, type PowerNode } from '@twin/core';
import { bySubstation, effectiveCircuits, effectiveRows, equipmentName } from '../../model/store/effective';
import type { WorkingCopyState } from '../../model/store/workingCopy';

type S = Pick<WorkingCopyState, 'saved' | 'overlays'>;

/**
 * 워킹카피 → 전원 계통 입력(`powerTree`·`powerLedger`). 판정은 core 한 곳이고, 여기는 입력을 모을 뿐이다.
 * 차단기는 effective 차단기(저장 + 변경안, 1..N), 연결은 이 국의 effective 연결.
 */
function powerInput(s: S, substationId: string, filter: CurrentFilter): PowerInput {
  const equipment = bySubstation(effectiveRows(s, 'equipment'), substationId);
  return {
    substationId,
    equipment,
    circuits: equipment.filter((e) => e.circuitCount > 0).flatMap((e) => effectiveCircuits(s, e.id)),
    links: bySubstation(effectiveRows(s, 'links'), substationId),
    filter,
    nameOf: (id) => equipmentName(s, id) ?? '',
  };
}

/** 차단기 대장 — 공급 설비마다 한 블록(이름 자연 순서). */
export function ledgerBlocks(s: S, substationId: string, filter: CurrentFilter): PowerNode[] {
  return powerLedger(powerInput(s, substationId, filter));
}

