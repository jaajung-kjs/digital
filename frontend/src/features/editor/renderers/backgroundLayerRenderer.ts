import type {
  BackgroundDrawing,
  BgFilled,
  BgLayer,
  BgPath,
  BgText,
} from '../../../types/floorPlan';

/**
 * Render the imported DWG background as a faded reference layer.
 * Drawn under user-editable elements but above the canvas background color.
 *
 * Coordinates in BackgroundDrawing are already in canvas pixels (post-normalization
 * on import), so no transform is needed beyond the caller's panX/panY/zoom.
 *
 * BYLAYER resolution: every entity (path/text/filled) may carry its own
 * color/lineweight/dashArray. If absent, we fall back to the owning layer's
 * defaults. If a layer cannot be found or is hidden (layer.isVisible=false
 * OR layer in `hiddenLayers`), the entity is skipped entirely.
 *
 * Render order (back to front):
 *   1. filled[]   — fills first
 *   2. paths[]    — strokes on top
 *   3. texts[]    — text labels on top
 */
export function renderBackgroundDrawing(
  ctx: CanvasRenderingContext2D,
  bg: BackgroundDrawing,
  opacity: number,
  hiddenLayers?: Set<string>,
): void {
  if (opacity <= 0) return;

  const layerMap = new Map<string, BgLayer>(bg.layers.map((l) => [l.name, l]));
  const isHidden = (name: string): boolean => {
    const layer = layerMap.get(name);
    if (!layer) return true;
    if (layer.isVisible === false) return true;
    if (hiddenLayers?.has(name)) return true;
    return false;
  };

  ctx.save();
  ctx.globalAlpha = opacity;

  // 1. filled — even-odd fills (outer + holes per entity)
  for (const f of bg.filled) {
    if (isHidden(f.layer)) continue;
    if (f.loops.length === 0) continue;
    const layer = layerMap.get(f.layer);
    ctx.fillStyle = f.color ?? layer?.color ?? '#999999';
    ctx.beginPath();
    let drewAny = false;
    for (const loop of f.loops) {
      if (loop.length < 4) continue;
      ctx.moveTo(loop[0], loop[1]);
      for (let i = 2; i < loop.length; i += 2) {
        ctx.lineTo(loop[i], loop[i + 1]);
      }
      ctx.closePath();
      drewAny = true;
    }
    if (drewAny) ctx.fill('evenodd');
  }

  // 2. paths — per-entity stroke (BYLAYER override fold-in)
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const p of bg.paths) {
    if (isHidden(p.layer)) continue;
    if (p.points.length < 4) continue;
    const layer = layerMap.get(p.layer);
    const style = resolveStyle(p, layer);
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.lineweight;
    ctx.setLineDash(style.dashArray ?? []);
    ctx.beginPath();
    ctx.moveTo(p.points[0], p.points[1]);
    for (let i = 2; i < p.points.length; i += 2) {
      ctx.lineTo(p.points[i], p.points[i + 1]);
    }
    if (p.closed) ctx.closePath();
    ctx.stroke();
  }
  ctx.setLineDash([]); // reset for safety

  // 3. texts — rotation + alignment via canvas transform
  for (const t of bg.texts) {
    if (isHidden(t.layer)) continue;
    const layer = layerMap.get(t.layer);
    ctx.save();
    ctx.fillStyle = t.color ?? layer?.color ?? '#3f3f46';
    ctx.font = `${t.size}px ${t.fontFamily ?? 'ui-sans-serif, system-ui, "Noto Sans KR", sans-serif'}`;
    ctx.textAlign =
      t.hAlign === 'center' ? 'center' : t.hAlign === 'right' ? 'right' : 'left';
    ctx.textBaseline =
      t.vAlign === 'top'
        ? 'top'
        : t.vAlign === 'middle'
        ? 'middle'
        : t.vAlign === 'bottom'
        ? 'bottom'
        : 'alphabetic';

    if (t.rotation && t.rotation !== 0) {
      ctx.translate(t.x, t.y);
      ctx.rotate(t.rotation);
      drawTextBody(ctx, t, 0, 0);
    } else {
      drawTextBody(ctx, t, t.x, t.y);
    }
    ctx.restore();
  }

  ctx.restore();
}

function resolveStyle(
  entity: BgPath,
  layer: BgLayer | undefined,
): { color: string; lineweight: number; dashArray?: number[] } {
  return {
    color: entity.color ?? layer?.color ?? '#666666',
    lineweight: entity.lineweight ?? layer?.lineweight ?? 1,
    dashArray: entity.dashArray ?? layer?.dashArray,
  };
}

function drawTextBody(
  ctx: CanvasRenderingContext2D,
  t: BgText,
  x: number,
  y: number,
): void {
  if (t.isMultiLine && t.text.includes('\n')) {
    const lines = t.text.split('\n');
    const lineHeight = t.size * 1.2;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, y + i * lineHeight);
    }
  } else {
    ctx.fillText(t.text, x, y);
  }
}

/**
 * Collect snap candidate points from background paths — every vertex of every
 * visible path. Hidden layers (layer.isVisible=false OR in `hiddenLayers`) are
 * skipped. Returns up to `maxPoints` to avoid blowing up snap performance.
 */
export function collectBackgroundSnapPoints(
  bg: BackgroundDrawing | null | undefined,
  hiddenLayers?: Set<string>,
  maxPoints = 2000,
): Array<{ x: number; y: number }> {
  if (!bg?.paths || bg.paths.length === 0) return [];
  const layerMap = new Map<string, BgLayer>(bg.layers.map((l) => [l.name, l]));
  const out: Array<{ x: number; y: number }> = [];
  for (const p of bg.paths) {
    const layer = layerMap.get(p.layer);
    if (!layer) continue;
    if (layer.isVisible === false) continue;
    if (hiddenLayers?.has(p.layer)) continue;
    for (let i = 0; i < p.points.length; i += 2) {
      out.push({ x: p.points[i], y: p.points[i + 1] });
      if (out.length >= maxPoints) return out;
    }
  }
  return out;
}

// Re-export entity types for convenience for downstream renderers
export type { BackgroundDrawing, BgLayer, BgPath, BgText, BgFilled };
