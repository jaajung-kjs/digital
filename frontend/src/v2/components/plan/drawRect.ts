/**
 * drawRect.ts — 평면도에 끌어 그린 사각형의 순수 헬퍼
 */

export const MIN_DRAW = 10;

/**
 * 두 점으로부터 정규화된 rect 반환 (역방향 드래그 포함).
 */
export function normalizeRect(
  start: { x: number; y: number },
  end: { x: number; y: number },
): { x: number; y: number; width: number; height: number } {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  return { x, y, width, height };
}

/**
 * 드래그한 영역이 최소 크기(MIN_DRAW) 이상인지 확인.
 * width와 height 모두 MIN_DRAW 이상이어야 true.
 */
export function isDrawLargeEnough(rect: { x: number; y: number; width: number; height: number }): boolean {
  return rect.width >= MIN_DRAW && rect.height >= MIN_DRAW;
}
