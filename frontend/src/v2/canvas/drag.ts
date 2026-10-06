// ported from frontend/src/utils/floorplan/dragSystem.ts (Stage 3)

import type { PlacedRect } from './hitTest';

export const DRAG_THRESHOLD = 3;

/**
 * 손이 아직 **창 안**에 있는가 — 끌기를 끝맺을 자리가 되는가.
 *
 * 단추를 누른 채로는 창을 벗어나도 좌표가 계속 온다(브라우저가 암묵적으로 붙잡는다). 그
 * 좌표로 그대로 끝맺으면 **손을 뗀 적 없는 자리**에 놓인다 — 판을 벗어났다 돌아오면 물건이
 * 엉뚱한 데 가 있는 것이 그것이다. 창 밖은 놓을 자리가 아니므로 그때는 물린다.
 */
export function inWindow(point: { clientX: number; clientY: number }): boolean {
  return (
    point.clientX >= 0 &&
    point.clientY >= 0 &&
    point.clientX <= window.innerWidth &&
    point.clientY <= window.innerHeight
  );
}

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
  asset: PlacedRect,
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
