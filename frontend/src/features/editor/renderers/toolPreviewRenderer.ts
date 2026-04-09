/**
 * Tool Preview Renderer — Cable Path Preview
 *
 * Draws the cable path preview on the canvas during cable tool interaction:
 * - Solid lines between committed waypoints
 * - Dashed line from last waypoint to cursor
 * - Small circles at each waypoint
 * - Equipment highlight when hovering over valid targets
 */

import type { FloorPlanEquipment } from '../../../types/floorPlan';
import type { CableToolState } from '../tools/cableTool';

// ============================================
// Style constants
// ============================================

const PATH_COLOR = '#3b82f6';          // blue-500
const PATH_WIDTH = 2;
const DASH_PATTERN: number[] = [6, 4];
const WAYPOINT_RADIUS = 4;
const WAYPOINT_FILL = '#ffffff';
const EQUIPMENT_HIGHLIGHT_COLOR = 'rgba(59, 130, 246, 0.25)'; // blue-500 @ 25%
const EQUIPMENT_HIGHLIGHT_STROKE = '#3b82f6';
const EQUIPMENT_HIGHLIGHT_WIDTH = 2;
const SOURCE_HIGHLIGHT_COLOR = 'rgba(34, 197, 94, 0.25)';     // green-500 @ 25%
const SOURCE_HIGHLIGHT_STROKE = '#22c55e';
const LENGTH_FONT = '11px monospace';
const LENGTH_BG = 'rgba(0, 0, 0, 0.7)';
const LENGTH_COLOR = '#ffffff';

// ============================================
// Render cable path preview
// ============================================

export function renderCablePathPreview(
  canvasCtx: CanvasRenderingContext2D,
  state: CableToolState,
  equipment: readonly FloorPlanEquipment[],
  displayColor?: string,
): void {
  if (state.phase !== 'drawingPath' && state.phase !== 'selectSource') return;

  const color = displayColor || PATH_COLOR;

  // Highlight source equipment
  if (state.sourceEquipmentId) {
    const source = equipment.find(eq => eq.id === state.sourceEquipmentId);
    if (source) {
      drawEquipmentHighlight(canvasCtx, source, SOURCE_HIGHLIGHT_COLOR, SOURCE_HIGHLIGHT_STROKE);
    }
  }

  // Highlight hovered equipment
  if (state.hoveredEquipmentId && state.hoveredEquipmentId !== state.sourceEquipmentId) {
    const hovered = equipment.find(eq => eq.id === state.hoveredEquipmentId);
    if (hovered) {
      drawEquipmentHighlight(canvasCtx, hovered, EQUIPMENT_HIGHLIGHT_COLOR, EQUIPMENT_HIGHLIGHT_STROKE);
    }
  }

  // Draw committed path segments (solid)
  if (state.pathPoints.length >= 2) {
    canvasCtx.save();
    canvasCtx.strokeStyle = color;
    canvasCtx.lineWidth = PATH_WIDTH;
    canvasCtx.lineJoin = 'round';
    canvasCtx.lineCap = 'round';
    canvasCtx.setLineDash([]);
    canvasCtx.beginPath();
    canvasCtx.moveTo(state.pathPoints[0][0], state.pathPoints[0][1]);
    for (let i = 1; i < state.pathPoints.length; i++) {
      canvasCtx.lineTo(state.pathPoints[i][0], state.pathPoints[i][1]);
    }
    canvasCtx.stroke();
    canvasCtx.restore();
  }

  // Draw pending segment (dashed) from last point to cursor
  if (state.pathPoints.length >= 1 && state.currentMousePos && state.phase === 'drawingPath') {
    const lastPoint = state.pathPoints[state.pathPoints.length - 1];
    canvasCtx.save();
    canvasCtx.strokeStyle = color;
    canvasCtx.lineWidth = PATH_WIDTH;
    canvasCtx.setLineDash(DASH_PATTERN);
    canvasCtx.globalAlpha = 0.6;
    canvasCtx.beginPath();
    canvasCtx.moveTo(lastPoint[0], lastPoint[1]);
    canvasCtx.lineTo(state.currentMousePos.x, state.currentMousePos.y);
    canvasCtx.stroke();
    canvasCtx.restore();
  }

  // Draw waypoint circles
  for (const point of state.pathPoints) {
    canvasCtx.save();
    canvasCtx.fillStyle = WAYPOINT_FILL;
    canvasCtx.strokeStyle = color;
    canvasCtx.lineWidth = 2;
    canvasCtx.setLineDash([]);
    canvasCtx.beginPath();
    canvasCtx.arc(point[0], point[1], WAYPOINT_RADIUS, 0, Math.PI * 2);
    canvasCtx.fill();
    canvasCtx.stroke();
    canvasCtx.restore();
  }

  // Draw length label if we have at least 2 points
  if (state.pathPoints.length >= 2) {
    const totalLength = computePathPixelLength(state.pathPoints);
    const meters = totalLength / 10; // default pixelsPerMeter=10
    drawLengthLabel(canvasCtx, state.pathPoints, `${meters.toFixed(1)}m`);
  }
}

// ============================================
// Helper: equipment highlight
// ============================================

function drawEquipmentHighlight(
  ctx: CanvasRenderingContext2D,
  eq: FloorPlanEquipment,
  fillColor: string,
  strokeColor: string,
): void {
  const pad = 3;
  ctx.save();
  ctx.fillStyle = fillColor;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = EQUIPMENT_HIGHLIGHT_WIDTH;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.roundRect(
    eq.positionX - pad,
    eq.positionY - pad,
    eq.width + pad * 2,
    eq.height + pad * 2,
    4,
  );
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// ============================================
// Helper: compute pixel length
// ============================================

function computePathPixelLength(points: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

// ============================================
// Helper: draw length label near midpoint
// ============================================

function drawLengthLabel(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
  text: string,
): void {
  // Position label at the midpoint of the entire path
  const totalLen = computePathPixelLength(points);
  const halfLen = totalLen / 2;
  let accumulated = 0;
  let midX = points[0][0];
  let midY = points[0][1];

  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    const segLen = Math.sqrt(dx * dx + dy * dy);
    if (accumulated + segLen >= halfLen) {
      const t = segLen > 0 ? (halfLen - accumulated) / segLen : 0;
      midX = points[i - 1][0] + dx * t;
      midY = points[i - 1][1] + dy * t;
      break;
    }
    accumulated += segLen;
  }

  ctx.save();
  ctx.font = LENGTH_FONT;
  const metrics = ctx.measureText(text);
  const padX = 4;
  const padY = 2;
  const boxW = metrics.width + padX * 2;
  const boxH = 16 + padY * 2;

  // Background pill
  ctx.fillStyle = LENGTH_BG;
  ctx.beginPath();
  ctx.roundRect(midX - boxW / 2, midY - boxH / 2 - 12, boxW, boxH, 3);
  ctx.fill();

  // Text
  ctx.fillStyle = LENGTH_COLOR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, midX, midY - 12);
  ctx.restore();
}
