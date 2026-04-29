import type { BackgroundDrawing } from '../../../types/floorPlan';

/**
 * Render the imported DWG background as a faded reference layer.
 * Drawn under user-editable elements but above the canvas background color.
 *
 * Coordinates in BackgroundDrawing are already in canvas pixels (post-normalization
 * on import), so no transform needed beyond the caller's panX/panY/zoom.
 */
export function renderBackgroundDrawing(
  ctx: CanvasRenderingContext2D,
  bg: BackgroundDrawing,
  opacity: number,
  showOutline = true,
  showLabels = true,
): void {
  if (opacity <= 0) return;

  ctx.save();
  ctx.globalAlpha = opacity;

  if (showOutline && bg.outline && bg.outline.polylines.length > 0) {
    ctx.strokeStyle = bg.outline.color;
    ctx.lineWidth = bg.outline.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (const flat of bg.outline.polylines) {
      if (flat.length < 4) continue;
      ctx.moveTo(flat[0], flat[1]);
      for (let i = 2; i < flat.length; i += 2) {
        ctx.lineTo(flat[i], flat[i + 1]);
      }
    }
    ctx.stroke();
  }

  if (showLabels && bg.labels.length > 0) {
    ctx.fillStyle = '#3f3f46';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (const label of bg.labels) {
      ctx.font = `${label.size}px ui-sans-serif, system-ui, -apple-system, "Noto Sans KR", sans-serif`;
      ctx.fillText(label.text, label.x, label.y);
    }
  }

  ctx.restore();
}

/**
 * Collect snap candidate points from background outline polylines —
 * endpoints and midpoints of each polyline segment.
 *
 * Returns up to `maxPoints` to avoid blowing up snap performance.
 */
export function collectBackgroundSnapPoints(
  bg: BackgroundDrawing | null | undefined,
  maxPoints = 2000,
): Array<{ x: number; y: number }> {
  if (!bg?.outline) return [];
  const out: Array<{ x: number; y: number }> = [];
  for (const flat of bg.outline.polylines) {
    for (let i = 0; i < flat.length; i += 2) {
      out.push({ x: flat[i], y: flat[i + 1] });
      if (out.length >= maxPoints) return out;
    }
  }
  return out;
}
