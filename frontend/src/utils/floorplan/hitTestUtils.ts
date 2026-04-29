/**
 * Hit Test 유틸리티 — Equipment 클릭 감지.
 */

import type { FloorPlanEquipment } from '../../types/floorPlan';

export function hitTestEquipment(
  x: number,
  y: number,
  item: FloorPlanEquipment
): boolean {
  return x >= item.positionX && x <= item.positionX + item.width &&
         y >= item.positionY && y <= item.positionY + item.height;
}

export type HitTestResult =
  | { type: 'equipment'; item: FloorPlanEquipment }
  | null;

/**
 * 좌표에서 가장 위의 설비를 찾는다. (FloorPlanElement는 더 이상 없음)
 */
export function findItemAt(
  x: number,
  y: number,
  // 호환성을 위해 elements 인자는 받지만 사용하지 않음 (호출처 정리 후 제거)
  _elements: unknown,
  equipment: FloorPlanEquipment[]
): HitTestResult {
  const eq = equipment.find((item) => hitTestEquipment(x, y, item));
  if (eq) return { type: 'equipment', item: eq };
  return null;
}
