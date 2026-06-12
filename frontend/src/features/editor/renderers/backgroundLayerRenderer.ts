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
 * CM-B: BackgroundDrawing 의 좌표 + lineweight + dashArray 가 모두 cm 단위
 * (캔버스 1 unit = 1 cm). 호출자는 ctx 에 이미 zoom scale 을 적용해 두지만
 * lineweight 는 그 transform 의 영향을 받지 않게 하고 싶을 수도 있고 ─ 여기서는
 * cm 그대로 두면 zoom 이 곱해져 화면 px 가 된다. 단, 너무 가는 선은 보이지
 * 않으므로 화면 px 환산 후 0.5 px 미만이면 0.5 px 로 강제. 이를 위해 호출자가
 * `zoom (px/cm)` 을 알려주면 더 정확한 강제값을 잡을 수 있다.
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
  zoom: number,
  hiddenLayers?: Set<string>,
): void {
  if (opacity <= 0) return;
  // Pre-DWG-A imports stored a flat outline/labels shape; ignore them so the
  // canvas does not crash. The user can re-import to get the new layer model.
  if (!bg || !Array.isArray(bg.layers) || !Array.isArray(bg.paths)) return;

  const layerMap = new Map<string, BgLayer>(bg.layers.map((l) => [l.name, l]));
  const isHidden = (name: string): boolean => {
    const layer = layerMap.get(name);
    if (!layer) return true;
    if (layer.isVisible === false) return true;
    if (hiddenLayers?.has(name)) return true;
    return false;
  };

  // Caller has applied ctx.scale(zoom, zoom). lineweight stored in cm needs
  // a screen-px floor of 0.5px so very thin lines remain visible at low zoom.
  // ctx.lineWidth is in canvas-units (cm), so the floor in cm is 0.5 / zoom.
  const safeZoom = Math.max(zoom, 0.0001);
  const minLineCm = 0.5 / safeZoom;

  ctx.save();
  ctx.globalAlpha = opacity;

  // 1. filled — even-odd fills (outer + holes per entity)
  for (const f of bg.filled ?? []) {
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
    ctx.lineWidth = Math.max(minLineCm, style.lineweight);
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
  for (const t of bg.texts ?? []) {
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

// Re-export entity types for convenience for downstream renderers
export type { BackgroundDrawing, BgLayer, BgPath, BgText, BgFilled };
