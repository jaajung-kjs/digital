import { useEffect, useMemo } from 'react';
import { effectiveRows } from '../../model/store/effective';
import { useWorkingCopy } from '../../model/store/workingCopy';
import type { useWorkspaceRoute } from '../../useWorkspaceRoute';

type Route = Pick<ReturnType<typeof useWorkspaceRoute>, 'eqId' | 'rackId' | 'selectEquipment' | 'selectRack'>;

/**
 * 주소가 가리키는 설비·랙 중 **지금 이 국에 있는 것**만 — 없으면 고른 것을 놓는다(주소에서도 걷는다, replace).
 *
 * 만든 뒤 실행 취소·변경 취소하면 그 행이 사라지는데, 주소에 남은 `eq`/`rack` 이 빈 상세 레일을 세워 두고
 * 선번장에서는 그 빈 레일이 표 폭 ⅓ 을 먹었다. 그 국을 다 읽은 뒤에만 판정한다(읽기 전에는 아직 모른다).
 * 국이 아닌 노드(지사·본부)에서는 손대지 않는다 — 그 범위의 설비는 워킹 카피에 없다.
 */
export function useLiveSelection(route: Route, substationId: string | null, loadedHere: boolean): { eqId: string | null; rackId: string | null } {
  const eqHere = useWorkingCopy((s) => route.eqId != null && substationId != null
    && effectiveRows(s, 'equipment').some((e) => e.id === route.eqId && e.substationId === substationId));
  const rackHere = useWorkingCopy((s) => route.rackId != null && substationId != null
    && effectiveRows(s, 'racks').some((r) => r.id === route.rackId && r.substationId === substationId));
  const staleEq = substationId != null && loadedHere && route.eqId != null && !eqHere;
  const staleRack = substationId != null && loadedHere && route.rackId != null && !rackHere;
  const { selectEquipment, selectRack } = route;
  useEffect(() => {
    if (staleEq) selectEquipment(null);
    else if (staleRack) selectRack(null);
  }, [staleEq, staleRack, selectEquipment, selectRack]);
  /* 사라진 것은 주소가 걷히기 전에도 그리지 않는다. */
  return useMemo(
    () => ({ eqId: staleEq ? null : route.eqId, rackId: staleRack ? null : route.rackId }),
    [staleEq, staleRack, route.eqId, route.rackId],
  );
}
