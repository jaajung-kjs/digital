/**
 * Connection overlay renderer for cable connections on the floor plan canvas.
 */

export interface ConnectionRenderContext {
  ctx: CanvasRenderingContext2D;
  zoom: number;
  panX: number;
  panY: number;
}

export interface RenderableConnection {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  cableType: string;
  label?: string;
  color: string;
  highlighted?: boolean;
  /** Cable ID for hit-testing */
  id?: string;
}

/** Draw a single curved connection line */
function drawConnectionCurve(
  ctx: CanvasRenderingContext2D,
  conn: RenderableConnection
): void {
  const { sourceX, sourceY, targetX, targetY } = conn;

  const offset = Math.min(Math.abs(targetX - sourceX), Math.abs(targetY - sourceY), 80) + 30;
  const cp1x = sourceX + offset;
  const cp1y = sourceY;
  const cp2x = targetX - offset;
  const cp2y = targetY;

  if (conn.highlighted) {
    ctx.save();
    ctx.shadowColor = conn.color;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = conn.color;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(sourceX, sourceY);
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, targetX, targetY);
    ctx.stroke();
    ctx.restore();
  }

  ctx.strokeStyle = conn.color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(sourceX, sourceY);
  ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, targetX, targetY);
  ctx.stroke();

  ctx.fillStyle = conn.color;
  ctx.beginPath();
  ctx.arc(sourceX, sourceY, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(targetX, targetY, 4, 0, Math.PI * 2);
  ctx.fill();
}

/** Draw cable type label at the midpoint */
function drawConnectionLabel(
  ctx: CanvasRenderingContext2D,
  conn: RenderableConnection
): void {
  const midX = (conn.sourceX + conn.targetX) / 2;
  const midY = (conn.sourceY + conn.targetY) / 2;
  const text = conn.label ? `${conn.cableType} - ${conn.label}` : conn.cableType;

  ctx.font = '11px sans-serif';
  const metrics = ctx.measureText(text);
  const padding = 4;
  const bgWidth = metrics.width + padding * 2;
  const bgHeight = 16;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.beginPath();
  ctx.roundRect(midX - bgWidth / 2, midY - bgHeight / 2, bgWidth, bgHeight, 4);
  ctx.fill();

  ctx.strokeStyle = conn.color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(midX - bgWidth / 2, midY - bgHeight / 2, bgWidth, bgHeight, 4);
  ctx.stroke();

  ctx.fillStyle = conn.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, midX, midY);
}

/** Render all connections overlay on the canvas */
export function renderConnections(
  context: ConnectionRenderContext,
  connections: RenderableConnection[]
): void {
  const { ctx, zoom, panX, panY } = context;
  if (connections.length === 0) return;

  ctx.save();
  const scale = zoom / 100;
  ctx.setTransform(scale, 0, 0, scale, panX, panY);

  for (const conn of connections) {
    drawConnectionCurve(ctx, conn);
  }
  for (const conn of connections) {
    drawConnectionLabel(ctx, conn);
  }

  ctx.restore();
}
