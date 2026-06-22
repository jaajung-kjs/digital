/**
 * 캔버스 변환 관련 유틸리티 함수들
 * 좌표 변환, 그리드 스냅, 변환 행렬 적용 등
 */


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
