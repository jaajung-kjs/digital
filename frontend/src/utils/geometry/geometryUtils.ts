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
 * 점을 특정 중심점 기준으로 역회전 (히트박스 계산용)
 * @param px 회전할 점의 x 좌표
 * @param py 회전할 점의 y 좌표
 * @param cx 회전 중심 x 좌표
 * @param cy 회전 중심 y 좌표
 * @param angleDeg 역회전할 각도 (도 단위)
 * @returns 역회전된 점 좌표
 */
export function rotatePointAroundOrigin(
  px: number,
  py: number,
  cx: number,
  cy: number,
  angleDeg: number
): { x: number; y: number } {
  const angleRad = (-angleDeg * Math.PI) / 180; // 역회전
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dx = px - cx;
  const dy = py - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
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

/**
 * 바운딩 박스 타입
 */
export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * 점이 바운딩 박스 안에 있는지 확인
 * @param x 점의 x 좌표
 * @param y 점의 y 좌표
 * @param box 바운딩 박스
 * @returns 점이 박스 안에 있으면 true
 */
export function isPointInBoundingBox(x: number, y: number, box: BoundingBox): boolean {
  return x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY;
}

/**
 * 점이 원 안에 있는지 확인
 * @param px 점의 x 좌표
 * @param py 점의 y 좌표
 * @param cx 원의 중심 x 좌표
 * @param cy 원의 중심 y 좌표
 * @param radius 원의 반지름
 * @returns 점이 원 안에 있으면 true
 */
export function isPointInCircle(
  px: number,
  py: number,
  cx: number,
  cy: number,
  radius: number
): boolean {
  return distance(px, py, cx, cy) <= radius;
}
