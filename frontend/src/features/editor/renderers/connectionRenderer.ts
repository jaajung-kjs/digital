/**
 * Connection overlay renderer for cable connections on the floor plan canvas.
 * Draws curved lines between equipment with labels and glow effects.
 */

import type { CableType } from '../../../types/connection';

export interface ConnectionRenderContext {
  ctx: CanvasRenderingContext2D;
  zoom: number;
  panX: number;
  panY: number;
  viewMode: 'connection-network' | 'connection-power' | 'connection-ground';
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
}

/** Color scheme for cable types */
export const CABLE_COLORS: Record<string, string> = {
  LAN: '#3b82f6',
  FIBER: '#22c55e',
  AC: '#ef4444',
  DC: '#f97316',
  GROUND: '#eab308',
};

/** Cable types shown per view mode */
const VIEW_MODE_CABLE_TYPES: Record<string, CableType[]> = {
  'connection-network': ['LAN', 'FIBER'],
  'connection-power': ['AC', 'DC'],
  'connection-ground': ['GROUND'],
};

/** Filter connections by view mode */
export function filterConnectionsByMode(
  connections: RenderableConnection[],
  viewMode: string
): RenderableConnection[] {
  const allowedTypes = VIEW_MODE_CABLE_TYPES[viewMode];
  if (!allowedTypes) return connections;
  return connections.filter((c) => allowedTypes.includes(c.cableType as CableType));
}

/** Draw a single curved connection line */
function drawConnectionCurve(
  ctx: CanvasRenderingContext2D,
  conn: RenderableConnection
): void {
  const { sourceX, sourceY, targetX, targetY } = conn;
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;

  // Control point offset for the bezier curve
  const offset = Math.min(Math.abs(dx), Math.abs(dy), 80) + 30;

  // Determine curve direction based on relative position
  const cp1x = sourceX + offset;
  const cp1y = sourceY;
  const cp2x = targetX - offset;
  const cp2y = targetY;

  // Glow effect for highlighted cables
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

  // Main line
  ctx.strokeStyle = conn.color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(sourceX, sourceY);
  ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, targetX, targetY);
  ctx.stroke();

  // Port dots at endpoints
  ctx.fillStyle = conn.color;
  ctx.beginPath();
  ctx.arc(sourceX, sourceY, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(targetX, targetY, 4, 0, Math.PI * 2);
  ctx.fill();
}

/** Draw cable type label at the midpoint of the connection */
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

  // Background pill
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.beginPath();
  ctx.roundRect(
    midX - bgWidth / 2,
    midY - bgHeight / 2,
    bgWidth,
    bgHeight,
    4
  );
  ctx.fill();

  // Border
  ctx.strokeStyle = conn.color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(
    midX - bgWidth / 2,
    midY - bgHeight / 2,
    bgWidth,
    bgHeight,
    4
  );
  ctx.stroke();

  // Text
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
  const { ctx, zoom, panX, panY, viewMode } = context;

  const filtered = filterConnectionsByMode(connections, viewMode);
  if (filtered.length === 0) return;

  ctx.save();

  // Apply viewport transform
  const scale = zoom / 100;
  ctx.setTransform(scale, 0, 0, scale, panX, panY);

  for (const conn of filtered) {
    drawConnectionCurve(ctx, conn);
  }

  // Draw labels on top of all lines
  for (const conn of filtered) {
    drawConnectionLabel(ctx, conn);
  }

  ctx.restore();
}
