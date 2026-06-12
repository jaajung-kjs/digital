/**
 * 기하학 관련 유틸리티 함수들
 * FloorPlanEditor에서 사용되는 수학/기하학 계산 함수 모음
 */

/**
 * 점과 선분 사이의 최단 거리 계산
 * @param px 점의 x 좌표
 * @param py 점의 y 좌표
 * @param x1 선분 시작점 x
 * @param y1 선분 시작점 y
 * @param x2 선분 끝점 x
 * @param y2 선분 끝점 y
 * @returns 점과 선분 사이의 최단 거리
 */
export function distanceToLineSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  if (lenSq !== 0) param = dot / lenSq;

  let xx, yy;
  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = px - xx;
  const dy = py - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 두 점 사이의 거리 계산
 * @param x1 첫 번째 점의 x 좌표
 * @param y1 첫 번째 점의 y 좌표
 * @param x2 두 번째 점의 x 좌표
 * @param y2 두 번째 점의 y 좌표
 * @returns 두 점 사이의 거리
 */
export function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}
