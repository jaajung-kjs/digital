// ported from frontend/src/utils/canvas/canvasTransform.ts (Stage 3)

/**
 * 그리드 스냅 적용
 * @param x x 좌표
 * @param y y 좌표
 * @param gridSize 그리드 크기
 * @param enabled 스냅 활성화 여부
 */
export function snapToGrid(
  x: number,
  y: number,
  gridSize: number,
  enabled: boolean = true,
): { x: number; y: number } {
  if (!enabled) return { x, y };
  return {
    x: Math.round(x / gridSize) * gridSize,
    y: Math.round(y / gridSize) * gridSize,
  };
}

/**
 * 스크린 좌표 → 월드(캔버스) 좌표 역변환
 * (구 useCanvasEvents.getCanvasCoordinates 수식을 순수 함수화)
 *
 * @param clientX 마우스 clientX
 * @param clientY 마우스 clientY
 * @param rect 캔버스 엘리먼트의 getBoundingClientRect()
 * @param panX 현재 pan X (px)
 * @param panY 현재 pan Y (px)
 * @param zoom 줌 레벨 (100 = 100%)
 */
export function screenToWorld(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  panX: number,
  panY: number,
  zoom: number,
): { x: number; y: number } {
  const scale = zoom / 100;
  return {
    x: (clientX - rect.left - panX) / scale,
    y: (clientY - rect.top - panY) / scale,
  };
}
