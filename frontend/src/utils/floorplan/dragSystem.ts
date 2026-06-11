/**
 * Equipment 드래그 시스템.
 * FloorPlanElement가 제거된 후, 평면도 위에서 드래그 가능한 건 설비뿐.
 */

import type { Asset } from '../../types/asset';
import { Position, getEquipmentPosition } from './elementSystem';

export interface DragTarget {
  type: 'equipment';
  id: string;
  initialPosition: Position;
}

export interface DragSession {
  startMousePosition: Position;
  target: DragTarget;
  isActive: boolean;
}

export function createDragSession(
  item: { type: 'equipment'; item: Asset },
  mousePosition: Position,
): DragSession {
  return {
    startMousePosition: { ...mousePosition },
    target: {
      type: 'equipment',
      id: item.item.id,
      initialPosition: getEquipmentPosition(item.item),
    },
    isActive: false,
  };
}

function calculateNewPosition(
  session: DragSession,
  currentMousePosition: Position,
  snapFn?: (pos: Position) => Position,
): Position {
  const dx = currentMousePosition.x - session.startMousePosition.x;
  const dy = currentMousePosition.y - session.startMousePosition.y;
  let newPos = {
    x: session.target.initialPosition.x + dx,
    y: session.target.initialPosition.y + dy,
  };
  if (snapFn) newPos = snapFn(newPos);
  return newPos;
}

export interface DragApplyResult {
  equipment: Asset[];
}

export function applyDrag(
  // 호환성: elements 인자는 무시 (호출처 정리 후 제거 예정)
  _elements: unknown,
  equipment: Asset[],
  session: DragSession,
  currentMousePosition: Position,
  snapFn?: (pos: Position) => Position,
): DragApplyResult {
  const newPos = calculateNewPosition(session, currentMousePosition, snapFn);
  const updated = equipment.map((item) =>
    item.id === session.target.id
      ? { ...item, positionX: newPos.x, positionY: newPos.y }
      : item,
  );
  return { equipment: updated };
}

function getDragDistance(session: DragSession, currentMousePosition: Position): number {
  const dx = currentMousePosition.x - session.startMousePosition.x;
  const dy = currentMousePosition.y - session.startMousePosition.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function isDragThresholdMet(
  session: DragSession,
  currentMousePosition: Position,
  threshold = 3,
): boolean {
  return getDragDistance(session, currentMousePosition) >= threshold;
}
