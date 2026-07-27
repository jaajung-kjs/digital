// ported from frontend/src/utils/floorplan/renderers.ts (Stage 3)

import { SELECTION_STYLES, ELEMENT_COLORS } from './constants';
import type { PlacedAsset } from './hitTest';

// ============================================
// Asset 렌더링 (V2 필드: x/y/width/height, rotation 없음)
// ============================================

const fontSizeCache = new Map<string, number>();

function renderAssetItem(
  ctx: CanvasRenderingContext2D,
  item: PlacedAsset,
  isSelected: boolean,
): void {
  const { x, y, width: w, height: h } = item;
  ctx.save();

  ctx.fillStyle = isSelected ? SELECTION_STYLES.fill : ELEMENT_COLORS.rack.fill;
  ctx.strokeStyle = isSelected ? SELECTION_STYLES.stroke : ELEMENT_COLORS.rack.stroke;
  ctx.lineWidth = isSelected ? 2 : 1;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);

  ctx.fillStyle = ELEMENT_COLORS.rack.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const padding = 4;
  const maxWidth = w - padding * 2;
  const maxHeight = h - padding * 2;

  if (maxWidth > 5 && maxHeight > 5) {
    const cacheKey = `${item.name}|${w}|${h}`;
    let fontSize = fontSizeCache.get(cacheKey);
    if (fontSize === undefined) {
      let lo = 6;
      let hi = Math.min(maxHeight, 40);
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        ctx.font = `bold ${mid}px sans-serif`;
        if (ctx.measureText(item.name).width <= maxWidth && mid <= maxHeight) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }
      fontSize = lo;
      fontSizeCache.set(cacheKey, fontSize);
    }
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillText(item.name, x + w / 2, y + h / 2, maxWidth);
  }

  ctx.restore();
}

/**
 * 배치된 자산 전체 렌더링.
 * selectedId 와 일치하는 자산은 선택 하이라이트로 그린다.
 * preview 가 있으면 해당 id의 자산은 preview 좌표/크기로 대체 렌더링.
 */
export function renderPlacedAssets(
  ctx: CanvasRenderingContext2D,
  assets: PlacedAsset[],
  selectedId: string | null,
  preview?: { id: string; x: number; y: number; width?: number; height?: number } | null,
): void {
  for (const asset of assets) {
    let item = asset;
    if (preview && asset.id === preview.id) {
      item = {
        ...asset,
        x: preview.x,
        y: preview.y,
        width: preview.width ?? asset.width,
        height: preview.height ?? asset.height,
      };
    }
    renderAssetItem(ctx, item, item.id === selectedId);
  }
}

/**
 * drag-to-draw 중 설비 박스 미리보기 (치수 라벨 포함).
 */
export function renderDrawPreview(
  ctx: CanvasRenderingContext2D,
  start: { x: number; y: number },
  end: { x: number; y: number } | null,
): void {
  if (!end) return;
  ctx.save();
  ctx.globalAlpha = 0.4;

  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const w = Math.abs(end.x - start.x);
  const h = Math.abs(end.y - start.y);

  ctx.fillStyle = ELEMENT_COLORS.rack.fill;
  ctx.strokeStyle = ELEMENT_COLORS.rack.stroke;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);

  if (w > 30 && h > 20) {
    ctx.fillStyle = ELEMENT_COLORS.rack.text;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.8;
    ctx.fillText(`${Math.round(w)}x${Math.round(h)}`, x + w / 2, y + h / 2);
  }

  ctx.restore();
}
