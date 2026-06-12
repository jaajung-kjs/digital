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
