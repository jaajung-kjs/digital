import type { PortRef } from '../catalog/types.js';
import { portHasRoom, portKind } from '../catalog/portKinds.js';

export type ConnectError = 'same-port' | 'port-occupied' | 'medium-mismatch' | 'direction-mismatch';

/**
 * 케이블을 두 포트에 물릴 수 있는지 판정.
 *
 * 규칙은 전부 `PORT_KINDS` 에서 나온다 — 여기에 종류별 분기는 없다.
 * - **자리**: 종류가 정한 만큼만 물린다. 접지 부스바는 제한이 없고 나머지는 1가닥이다.
 * - **상대**: 종류가 선언한 상대끼리만 붙는다.
 * - **방향**: 전원처럼 공급/소비가 갈리는 종류는 반대 방향끼리만 붙는다.
 *   `BI`(양방향)는 어느 쪽과도 맞는다 — "정해지지 않음" 이지 "같은 쪽" 이 아니다.
 *
 * @param cableCountByPortId 각 포트에 이미 물려 있는 케이블 수. 없으면 0으로 본다.
 * @param cableMedium 케이블 종류. 주면 포트 종류와 일치하는지도 본다.
 */
export function validateConnection(
  a: PortRef,
  b: PortRef,
  cableCountByPortId: ReadonlyMap<string, number>,
  cableMedium?: string,
): ConnectError | null {
  if (a.id === b.id) return 'same-port';

  if (
    !portHasRoom(a.medium, cableCountByPortId.get(a.id) ?? 0) ||
    !portHasRoom(b.medium, cableCountByPortId.get(b.id) ?? 0)
  ) {
    return 'port-occupied';
  }

  const kind = portKind(a.medium);
  // 어휘에 없는 종류는 예전 규칙(같은 매체끼리)으로 둔다 — 데이터가 앞서 나가도 잠기지 않게.
  const accepts = kind ? kind.connectsTo.includes(b.medium) : a.medium === b.medium;
  if (!accepts) return 'medium-mismatch';
  if (cableMedium !== undefined && a.medium !== cableMedium) return 'medium-mismatch';

  if (kind?.pairing === 'opposite' && a.direction === b.direction && a.direction !== 'BI') {
    return 'direction-mismatch';
  }

  return null;
}
