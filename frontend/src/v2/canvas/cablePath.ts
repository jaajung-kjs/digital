export interface Point {
  x: number;
  y: number;
}

/**
 * 케이블 경로점 조작 — 순수 계산만 담는다(캔버스·DOM 을 모르는 곳).
 *
 * 케이블은 `[a자산 중심, ...pathPoints, b자산 중심]` 을 잇는 꺾은선으로 그려진다
 * (`cableSegments`). 양 끝은 자산을 따라 움직이므로 편집 대상이 아니고, **가운데
 * pathPoints 만** 사용자가 만든다. 여기서 다루는 인덱스는 전부 pathPoints 기준이다.
 */

/** 선분 위에서 점 p 에 가장 가까운 위치까지의 거리와, 그 위치의 t(0~1). */
function projectOnSegment(p: Point, a: Point, b: Point): { dist: number; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { dist: Math.hypot(p.x - a.x, p.y - a.y), t: 0 };
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return { dist: Math.hypot(p.x - px, p.y - py), t };
}

/**
 * 꺾은선 위 어느 구간을 눌렀는지 → 그 자리에 넣을 pathPoints 인덱스.
 *
 * 전체 점 목록은 `[aCenter, ...pathPoints, bCenter]` 이므로, k 번째 **구간**을 누르면
 * 새 점은 pathPoints 의 k 번 자리에 들어간다(구간 0 = aCenter→pathPoints[0]).
 *
 * @param points 끝점을 포함한 전체 꺾은선 점 목록
 * @returns 임계 거리 안이면 삽입 위치와 좌표, 아니면 null
 */
export function insertionAt(points: readonly Point[], at: Point, threshold: number): { index: number; point: Point } | null {
  let best: { index: number; point: Point; dist: number } | null = null;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const { dist, t } = projectOnSegment(at, a, b);
    if (dist > threshold) continue;
    if (best && dist >= best.dist) continue;
    best = { index: i, point: { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }, dist };
  }
  return best ? { index: best.index, point: best.point } : null;
}

/** 경로점 하나를 끼워 넣는다. */
export function insertPathPoint(pathPoints: readonly Point[], index: number, point: Point): Point[] {
  const next = [...pathPoints];
  next.splice(index, 0, point);
  return next;
}

/** 경로점 하나를 옮긴다. */
export function movePathPoint(pathPoints: readonly Point[], index: number, point: Point): Point[] {
  if (index < 0 || index >= pathPoints.length) return [...pathPoints];
  const next = [...pathPoints];
  next[index] = point;
  return next;
}

/** 경로점 하나를 뺀다 — 전부 빼면 직선으로 돌아간다. */
export function removePathPoint(pathPoints: readonly Point[], index: number): Point[] {
  if (index < 0 || index >= pathPoints.length) return [...pathPoints];
  return pathPoints.filter((_, i) => i !== index);
}
