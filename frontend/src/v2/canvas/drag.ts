// ported from frontend/src/utils/floorplan/dragSystem.ts (Stage 3)

import type { PlacedAsset } from './hitTest';

export const DRAG_THRESHOLD = 3;

export interface DragSession {
  startMouse: { x: number; y: number };
  assetId: string;
  initial: { x: number; y: number };
  moved: boolean;
}

/**
 * 드래그 세션 시작.
 */
export function createDragSession(
  asset: PlacedAsset,
  mouse: { x: number; y: number },
): DragSession {
  return {
    startMouse: { x: mouse.x, y: mouse.y },
    assetId: asset.id,
    initial: { x: asset.x, y: asset.y },
    moved: false,
  };
}

/**
 * 현재 마우스 위치 기준 새 자산 위치 계산 (initial + delta → snap 적용).
 *
 * @param snapFn `(pos: {x,y}) => {x,y}` — 외부 그리드 스냅 함수
 */
export function dragDelta(
  session: DragSession,
  mouse: { x: number; y: number },
  snapFn: (pos: { x: number; y: number }) => { x: number; y: number },
): { x: number; y: number } {
  const dx = mouse.x - session.startMouse.x;
  const dy = mouse.y - session.startMouse.y;
  const raw = {
    x: session.initial.x + dx,
    y: session.initial.y + dy,
  };
  return snapFn(raw);
}

/**
 * 드래그 임계값(3px) 초과 여부.
 */
export function isThresholdMet(
  session: DragSession,
  mouse: { x: number; y: number },
): boolean {
  const dx = mouse.x - session.startMouse.x;
  const dy = mouse.y - session.startMouse.y;
  return Math.sqrt(dx * dx + dy * dy) >= DRAG_THRESHOLD;
}
