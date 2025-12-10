/**
 * 캔버스 변환 관련 유틸리티 함수들
 * 좌표 변환, 그리드 스냅, 변환 행렬 적용 등
 */

/**
 * 둥근 모서리 사각형 경로 생성
 * @param ctx Canvas 2D 컨텍스트
 * @param x 좌상단 x 좌표
 * @param y 좌상단 y 좌표
 * @param width 너비
 * @param height 높이
 * @param radius 모서리 반지름
 */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * 화면 좌표를 월드 좌표로 변환
 * @param screenX 화면 x 좌표
 * @param screenY 화면 y 좌표
 * @param panX 팬 x 오프셋
 * @param panY 팬 y 오프셋
 * @param zoom 줌 레벨 (100 = 100%)
 * @returns 월드 좌표
 */
export function screenToWorld(
  screenX: number,
  screenY: number,
  panX: number,
  panY: number,
  zoom: number
): { x: number; y: number } {
  const scale = zoom / 100;
  return {
    x: (screenX - panX) / scale,
    y: (screenY - panY) / scale,
  };
}

/**
 * 월드 좌표를 화면 좌표로 변환
 * @param worldX 월드 x 좌표
 * @param worldY 월드 y 좌표
 * @param panX 팬 x 오프셋
 * @param panY 팬 y 오프셋
 * @param zoom 줌 레벨 (100 = 100%)
 * @returns 화면 좌표
 */
export function worldToScreen(
  worldX: number,
  worldY: number,
  panX: number,
  panY: number,
  zoom: number
): { x: number; y: number } {
  const scale = zoom / 100;
  return {
    x: worldX * scale + panX,
    y: worldY * scale + panY,
  };
}

/**
 * 그리드 스냅 적용
 * @param x x 좌표
 * @param y y 좌표
 * @param gridSize 그리드 크기
 * @param enabled 스냅 활성화 여부
 * @returns 스냅된 좌표
 */
export function snapToGrid(
  x: number,
  y: number,
  gridSize: number,
  enabled: boolean = true
): { x: number; y: number } {
  if (!enabled) return { x, y };
  return {
    x: Math.round(x / gridSize) * gridSize,
    y: Math.round(y / gridSize) * gridSize,
  };
}

/**
 * 사각형 요소에 변환 적용 (rect, door, window 공통)
 * translate → rotate → scale(flip) 순서로 적용
 * @param ctx Canvas 2D 컨텍스트
 * @param x x 좌표 (변환 원점)
 * @param y y 좌표 (변환 원점)
 * @param rotation 회전 각도 (도 단위)
 * @param flipH 수평 반전 여부
 * @param flipV 수직 반전 여부
 */
export function applyRectTransform(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rotation: number,
  flipH: boolean,
  flipV: boolean
): void {
  ctx.translate(x, y);
  if (rotation) {
    ctx.rotate((rotation * Math.PI) / 180);
  }
  const scaleX = flipH ? -1 : 1;
  const scaleY = flipV ? -1 : 1;
  ctx.scale(scaleX, scaleY);
}

/**
 * 뷰포트 영역 계산 (무한 캔버스용)
 * @param canvasWidth 캔버스 너비
 * @param canvasHeight 캔버스 높이
 * @param panX 팬 x 오프셋
 * @param panY 팬 y 오프셋
 * @param zoom 줌 레벨 (100 = 100%)
 * @returns 뷰포트의 월드 좌표 범위
 */
export function calculateViewport(
  canvasWidth: number,
  canvasHeight: number,
  panX: number,
  panY: number,
  zoom: number
): { left: number; top: number; right: number; bottom: number } {
  const scale = zoom / 100;
  return {
    left: -panX / scale,
    top: -panY / scale,
    right: (-panX + canvasWidth) / scale,
    bottom: (-panY + canvasHeight) / scale,
  };
}
