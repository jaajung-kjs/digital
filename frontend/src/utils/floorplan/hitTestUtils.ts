/**
 * Hit Test 유틸리티 — Equipment 클릭 감지.
 */

import type { Asset } from '../../types/asset';
import { widthOf, heightOf } from '../../features/workingCopy/placement';

export function hitTestEquipment(
  x: number,
  y: number,
  item: Asset
): boolean {
  const px = item.positionX ?? 0;
  const py = item.positionY ?? 0;
  return x >= px && x <= px + widthOf(item) &&
         y >= py && y <= py + heightOf(item);
}

export type HitTestResult =
  | { type: 'equipment'; item: Asset }
  | null;

/**
 * 좌표에서 가장 위의 설비를 찾는다. (FloorPlanElement는 더 이상 없음)
 */
export function findItemAt(
  x: number,
  y: number,
  // 호환성을 위해 elements 인자는 받지만 사용하지 않음 (호출처 정리 후 제거)
  _elements: unknown,
  equipment: Asset[]
): HitTestResult {
  const eq = equipment.find((item) => hitTestEquipment(x, y, item));
  if (eq) return { type: 'equipment', item: eq };
  return null;
}
