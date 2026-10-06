// ported from frontend/src/features/editor/renderers/gridRenderer.ts (Stage 3)
import { canvasColor } from './theme';

/**
 * Grid renderer for CAD-style dual grid
 */

/* 색은 토큰에서 온다(`--canvas-*`) — 굵기·간격만 여기 남는다(치수는 색이 아니다). */
/**
 * 세부 격자 — **크게 확대했을 때만** 뜬다(10 cm).
 *
 * 타일(60cm) 눈금만으로는 반을 타일 안 어디에 놓았는지 셀 수 없다. 그렇다고 늘 그리면
 * 배율 100%에서 한 칸이 1px 이라 회색 면처럼 깔린다 — 예전에 그랬다. 그래서 **한 칸이
 * 화면에서 읽을 만해질 때**(8px 이상) 비로소 나타난다. 도면이 축척에 따라 적는 양을
 * 바꾸는 것과 같은 규칙이다.
 */
const FINE_SIZE = 10;
const FINE_MIN_PX = 8;

const GRID_CONFIG = {
  fineGrid: {
    get color() { return canvasColor('canvas-grid-fine'); },
    lineWidth: 0.5,
  },
  majorGrid: {
    get color() { return canvasColor('canvas-grid-major'); },
    lineWidth: 1,
  },
  minorGrid: {
    /**
     * **60 cm — 액세스플로어 타일 한 장.**
     *
     * 전산실 바닥은 600×600mm 액세스플로어다(사내 자재 DB). 격자를 그 치수로 두면 화면의
     * 눈금이 **실물 바닥 타일과 그대로 겹친다** — 「이 반은 타일 두 장 자리」처럼 현장에서
     * 쓰는 말로 도면을 읽을 수 있다. 임의의 어림수(10cm·50cm)로는 그 대응이 생기지 않는다.
     *
     * 10 cm 였던 동안에는 배율 100%에서 한 칸이 1px 이라 격자가 회색 면처럼 깔렸다.
     */
    size: 60,
    get color() { return canvasColor('canvas-grid-minor'); },
    lineWidth: 0.5,
  },
};

/**
 * Render dual grid (minor + major)
 */
export function renderGrid(
  ctx: CanvasRenderingContext2D,
  majorSize: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
  /** world→화면 배율(px/cm) — 세부 격자를 언제 낼지 정한다. */
  scale = 1,
): void {
  const minorSize = GRID_CONFIG.minorGrid.size;

  // Fine grid (10 cm) — 크게 확대했을 때만
  if (FINE_SIZE * scale >= FINE_MIN_PX) {
    ctx.strokeStyle = GRID_CONFIG.fineGrid.color;
    ctx.lineWidth = GRID_CONFIG.fineGrid.lineWidth;
    const fx0 = Math.floor(left / FINE_SIZE) * FINE_SIZE;
    const fy0 = Math.floor(top / FINE_SIZE) * FINE_SIZE;
    const fx1 = Math.ceil(right / FINE_SIZE) * FINE_SIZE;
    const fy1 = Math.ceil(bottom / FINE_SIZE) * FINE_SIZE;
    ctx.beginPath();
    for (let x = fx0; x <= fx1; x += FINE_SIZE) { ctx.moveTo(x, fy0); ctx.lineTo(x, fy1); }
    for (let y = fy0; y <= fy1; y += FINE_SIZE) { ctx.moveTo(fx0, y); ctx.lineTo(fx1, y); }
    ctx.stroke();
  }

  // Minor grid (below)
  const minorStartX = Math.floor(left / minorSize) * minorSize;
  const minorStartY = Math.floor(top / minorSize) * minorSize;
  const minorEndX = Math.ceil(right / minorSize) * minorSize;
  const minorEndY = Math.ceil(bottom / minorSize) * minorSize;

  ctx.strokeStyle = GRID_CONFIG.minorGrid.color;
  ctx.lineWidth = GRID_CONFIG.minorGrid.lineWidth;
  for (let x = minorStartX; x <= minorEndX; x += minorSize) {
    ctx.beginPath();
    ctx.moveTo(x, minorStartY);
    ctx.lineTo(x, minorEndY);
    ctx.stroke();
  }
  for (let y = minorStartY; y <= minorEndY; y += minorSize) {
    ctx.beginPath();
    ctx.moveTo(minorStartX, y);
    ctx.lineTo(minorEndX, y);
    ctx.stroke();
  }

  // Major grid (above)
  const gridStartX = Math.floor(left / majorSize) * majorSize;
  const gridStartY = Math.floor(top / majorSize) * majorSize;
  const gridEndX = Math.ceil(right / majorSize) * majorSize;
  const gridEndY = Math.ceil(bottom / majorSize) * majorSize;

  ctx.strokeStyle = GRID_CONFIG.majorGrid.color;
  ctx.lineWidth = GRID_CONFIG.majorGrid.lineWidth;
  for (let x = gridStartX; x <= gridEndX; x += majorSize) {
    ctx.beginPath();
    ctx.moveTo(x, gridStartY);
    ctx.lineTo(x, gridEndY);
    ctx.stroke();
  }
  for (let y = gridStartY; y <= gridEndY; y += majorSize) {
    ctx.beginPath();
    ctx.moveTo(gridStartX, y);
    ctx.lineTo(gridEndX, y);
    ctx.stroke();
  }
}
