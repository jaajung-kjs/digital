import type { PortRef } from '../catalog/types.js';

export type ConnectError = 'same-port' | 'port-occupied' | 'medium-mismatch';

/** 케이블을 두 포트에 물릴 수 있는지 판정. occupiedPortIds = 기존 케이블이 점유 중인 포트 id 집합.
 *  cableMedium 지정 시 포트 매체와 불일치하면 medium-mismatch. */
export function validateConnection(
  a: PortRef,
  b: PortRef,
  occupiedPortIds: ReadonlySet<string>,
  cableMedium?: string,
): ConnectError | null {
  if (a.id === b.id) return 'same-port';
  if (occupiedPortIds.has(a.id) || occupiedPortIds.has(b.id)) return 'port-occupied';
  if (a.medium !== b.medium) return 'medium-mismatch';
  if (cableMedium !== undefined && a.medium !== cableMedium) return 'medium-mismatch';
  return null;
}
