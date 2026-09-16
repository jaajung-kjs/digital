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

// ── 줌 ────────────────────────────────────────────────────────────────────────

export interface Viewport {
  /** 100 = 100% */
  zoom: number;
  panX: number;
  panY: number;
}

export const MIN_ZOOM = 10;
export const MAX_ZOOM = 1000;
/** 버튼 한 번 / 휠 한 칸의 배율 — 휠과 버튼이 같은 보폭으로 움직이게 한 곳에서 정한다. */
export const ZOOM_STEP = 1.1;

/**
 * 한 점을 고정한 채 확대/축소한다.
 *
 * 휠은 커서를, 버튼은 캔버스 중앙을 고정한다 — **고정점만 다르고 계산은 같다**.
 * 예전에는 이 계산이 휠 핸들러 안에만 인라인으로 있어서, 버튼을 붙이려면 같은 식을
 * 한 번 더 쓸 수밖에 없었다. 판정을 여기 한 곳에 둔다.
 *
 * @param anchorX/anchorY 캔버스 좌상단 기준 좌표(px) — 이 점 아래의 도면 위치가 그대로 남는다.
 */
export function zoomAtPoint(v: Viewport, factor: number, anchorX: number, anchorY: number): Viewport {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
  const oldScale = v.zoom / 100;
  const newScale = zoom / 100;
  const worldX = (anchorX - v.panX) / oldScale;
  const worldY = (anchorY - v.panY) / oldScale;
  return { zoom, panX: anchorX - worldX * newScale, panY: anchorY - worldY * newScale };
}

/**
 * 격자에 맞추되 **직전 점의 축을 먼저 존중한다**.
 *
 * 케이블은 설비 **중앙**에서 시작하는데, 그 중앙이 격자 위라는 보장이 없다(설비 폭이 홀수
 * 칸이면 중앙은 반 칸 어긋난다). 그래서 손끝을 격자에만 맞추면 **첫 구간이 늘 비스듬히**
 * 나갔다 — 곧게 뽑고 싶어도 뽑을 수가 없었다. 실제 배선은 트레이·벽을 타고 직각으로 돈다.
 *
 * 규칙은 하나다: 손끝이 직전 점의 가로축(또는 세로축)에 **한 칸 안으로** 들어오면 격자
 * 대신 **그 축에 붙는다.** 그러면 중앙에서 곧게 나가는 길이 늘 잡히고, 축에서 벗어나면
 * 평소처럼 격자에 맞는다.
 */
export function snapOrtho(
  prev: { x: number; y: number } | null,
  x: number,
  y: number,
  gridSize: number,
): { x: number; y: number } {
  const g = snapToGrid(x, y, gridSize);
  if (!prev) return g;
  return {
    x: Math.abs(x - prev.x) <= gridSize ? prev.x : g.x,
    y: Math.abs(y - prev.y) <= gridSize ? prev.y : g.y,
  };
}
