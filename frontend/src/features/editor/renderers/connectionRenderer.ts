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
  /** Path waypoints for polyline rendering (replaces bezier when present) */
  pathPoints?: [number, number][];
  /** Path length details for hover display */
  pathLength?: number | null;
  totalLength?: number | null;
  /** Material category code from DB (used for filtering) */
  materialCategoryCode?: string | null;
}

/** Draw a polyline connection (used when pathPoints are available) */
function drawConnectionPolyline(
  ctx: CanvasRenderingContext2D,
  conn: RenderableConnection
): void {
  const points = conn.pathPoints!;
  if (points.length < 2) return;

  if (conn.highlighted) {
    ctx.save();
    ctx.shadowColor = conn.color;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = conn.color;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.stroke();
    ctx.restore();
  }

  ctx.strokeStyle = conn.color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i][0], points[i][1]);
  }
  ctx.stroke();

  // Endpoint markers
  ctx.fillStyle = conn.color;
  ctx.beginPath();
  ctx.arc(points[0][0], points[0][1], 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(points[points.length - 1][0], points[points.length - 1][1], 4, 0, Math.PI * 2);
  ctx.fill();

  // Small waypoint markers for intermediate points
  for (let i = 1; i < points.length - 1; i++) {
    ctx.fillRect(points[i][0] - 2, points[i][1] - 2, 4, 4);
  }
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
  let midX: number;
  let midY: number;

  if (conn.pathPoints && conn.pathPoints.length >= 2) {
    // For polylines, find the midpoint along the path
    const pts = conn.pathPoints;
    const midIdx = Math.floor(pts.length / 2);
    if (pts.length % 2 === 0) {
      midX = (pts[midIdx - 1][0] + pts[midIdx][0]) / 2;
      midY = (pts[midIdx - 1][1] + pts[midIdx][1]) / 2;
    } else {
      midX = pts[midIdx][0];
      midY = pts[midIdx][1];
    }
  } else {
    midX = (conn.sourceX + conn.targetX) / 2;
    midY = (conn.sourceY + conn.targetY) / 2;
  }

  let text = conn.label ? `${conn.cableType} - ${conn.label}` : conn.cableType;
  if (conn.totalLength != null) {
    text += ` (${conn.totalLength}m)`;
  }

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
    if (conn.pathPoints && conn.pathPoints.length >= 2) {
      drawConnectionPolyline(ctx, conn);
    } else {
      drawConnectionCurve(ctx, conn);
    }
  }
  for (const conn of connections) {
    drawConnectionLabel(ctx, conn);
  }

  ctx.restore();
}
