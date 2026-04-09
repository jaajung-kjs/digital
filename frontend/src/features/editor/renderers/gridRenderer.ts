/**
 * Grid renderer for CAD-style dual grid
 */

const GRID_CONFIG = {
  majorGrid: {
    color: '#c0c0c0',
    lineWidth: 1,
  },
  minorGrid: {
    size: 10,
    color: '#e8e8e8',
    lineWidth: 0.5,
  },
};

/**
 * Render dual grid (minor + major) and origin marker
 */
export function renderGrid(
  ctx: CanvasRenderingContext2D,
  majorSize: number,
  viewportLeft: number,
  viewportTop: number,
  viewportRight: number,
  viewportBottom: number
): void {
  const minorSize = GRID_CONFIG.minorGrid.size;

  // Minor grid (below)
  const minorStartX = Math.floor(viewportLeft / minorSize) * minorSize;
  const minorStartY = Math.floor(viewportTop / minorSize) * minorSize;
  const minorEndX = Math.ceil(viewportRight / minorSize) * minorSize;
  const minorEndY = Math.ceil(viewportBottom / minorSize) * minorSize;

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
  const gridStartX = Math.floor(viewportLeft / majorSize) * majorSize;
  const gridStartY = Math.floor(viewportTop / majorSize) * majorSize;
  const gridEndX = Math.ceil(viewportRight / majorSize) * majorSize;
  const gridEndY = Math.ceil(viewportBottom / majorSize) * majorSize;

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
  if (viewportLeft <= 0 && viewportRight >= 0 && viewportTop <= 0 && viewportBottom >= 0) {
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(10, 0);
    ctx.moveTo(0, -10);
    ctx.lineTo(0, 10);
    ctx.stroke();
  }
}
