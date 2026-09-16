// ported from frontend/src/features/editor/renderers/gridRenderer.ts (Stage 3)
import { canvasColor } from './theme';

/**
 * Grid renderer for CAD-style dual grid
 */

/* 색은 토큰에서 온다(`--canvas-*`) — 굵기·간격만 여기 남는다(치수는 색이 아니다). */
const GRID_CONFIG = {
  majorGrid: {
    get color() { return canvasColor('canvas-grid-major'); },
    lineWidth: 1,
  },
  minorGrid: {
    /* **50 cm.** 10 cm 였던 동안 격자가 도면이 아니라 모눈종이로 보였다 — 배율 100%
       에서 한 칸이 1px 이라 회색 면처럼 깔렸다. 주 격자(1 m)의 절반이 실무 도면의 눈금이다. */
    size: 50,
    get color() { return canvasColor('canvas-grid-minor'); },
    lineWidth: 0.5,
  },
};

/**
 * Render dual grid (minor + major) and origin marker
 */
export function renderGrid(
  ctx: CanvasRenderingContext2D,
  majorSize: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
): void {
  const minorSize = GRID_CONFIG.minorGrid.size;

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

  // Origin marker (0,0)
  if (left <= 0 && right >= 0 && top <= 0 && bottom >= 0) {
    ctx.strokeStyle = canvasColor('canvas-origin');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(10, 0);
    ctx.moveTo(0, -10);
    ctx.lineTo(0, 10);
    ctx.stroke();
  }
}
