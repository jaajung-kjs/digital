/**
 * 평면도 캔버스 렌더러 — 자산(Asset) 전용.
 * FloorPlanElement가 제거된 이후 이 파일은 자산 그리기/미리보기/길이표시만 담당한다.
 */

import type { Asset } from '../../types/asset';
import { SELECTION_STYLES, ELEMENT_COLORS } from '../canvas/canvasDrawing';
import { distance } from '../geometry/geometryUtils';

// ============================================
// 길이 라벨 (선분 중간에 cm 길이 표시 — CM-B: 캔버스 1 unit = 1 cm)
// ============================================

export function renderLengthLabel(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  zoom: number = 100,
  color: string = '#1a1a1a',
  backgroundColor: string = 'rgba(255, 255, 255, 0.9)',
): void {
  const length = Math.round(distance(x1, y1, x2, y2));
  if (length < 10) return;

  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const fontSize = Math.max(10, Math.min(16, 12 * (100 / zoom)));
  // CM-B: distance() 는 캔버스 좌표 단위 = cm 이므로 cm 라벨로 표시.
  const text = `${length}cm`;

  ctx.save();
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const w = ctx.measureText(text).width + 6;
  const h = fontSize + 6;
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(midX - w / 2, midY - h / 2, w, h);

  ctx.fillStyle = color;
  ctx.fillText(text, midX, midY);
  ctx.restore();
}

// ============================================
// Asset 렌더링
// ============================================

const fontSizeCache = new Map<string, number>();

export function renderAssetItem(
  ctx: CanvasRenderingContext2D,
  item: Asset,
  isSelected: boolean,
): void {
  const w = item.width2d ?? 0;
  const h = item.height2d ?? 0;
  const px = item.positionX ?? 0;
  const py = item.positionY ?? 0;
  ctx.save();
  ctx.translate(px + w / 2, py + h / 2);
  ctx.rotate(((item.rotation ?? 0) * Math.PI) / 180);
  ctx.translate(-w / 2, -h / 2);

  ctx.fillStyle = isSelected ? SELECTION_STYLES.fill : ELEMENT_COLORS.rack.fill;
  ctx.strokeStyle = isSelected ? SELECTION_STYLES.stroke : ELEMENT_COLORS.rack.stroke;
  ctx.lineWidth = isSelected ? 2 : 1;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeRect(0, 0, w, h);

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
    ctx.fillText(item.name, w / 2, h / 2, maxWidth);
  }

  ctx.restore();
}

export function renderAssetItems(
  ctx: CanvasRenderingContext2D,
  items: Asset[],
  selectedIds: string[],
): void {
  for (const item of items) {
    renderAssetItem(ctx, item, selectedIds.includes(item.id));
  }
}

/** 설비 배치 직전, 마우스 hover 위치에 십자선 표시 */
export function renderAssetPreview(
  ctx: CanvasRenderingContext2D,
  position: { x: number; y: number },
): void {
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = ELEMENT_COLORS.rack.stroke;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(position.x - 15, position.y);
  ctx.lineTo(position.x + 15, position.y);
  ctx.moveTo(position.x, position.y - 15);
  ctx.lineTo(position.x, position.y + 15);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/** 프리셋 armed 상태에서 hover 위치에 프리셋 크기의 사각형 미리보기 */
export function renderPresetPreview(
  ctx: CanvasRenderingContext2D,
  position: { x: number; y: number },
  width: number,
  height: number,
  label?: string,
): void {
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = ELEMENT_COLORS.rack.fill;
  ctx.fillRect(position.x, position.y, width, height);
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = ELEMENT_COLORS.rack.stroke;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(position.x, position.y, width, height);
  ctx.setLineDash([]);

  if (label && width > 30 && height > 18) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = ELEMENT_COLORS.rack.text;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, position.x + width / 2, position.y + height / 2);
  }
  ctx.restore();
}

/** drag-to-draw 중 설비 박스 미리보기 */
export function renderAssetDrawPreview(
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

/** 설비 가로/세로 길이 표시 */
export function renderAssetLengths(
  ctx: CanvasRenderingContext2D,
  items: Asset[],
  zoom: number = 100,
): void {
  for (const item of items) {
    const px = item.positionX ?? 0;
    const py = item.positionY ?? 0;
    const w = item.width2d ?? 0;
    const h = item.height2d ?? 0;
    renderLengthLabel(ctx, px, py, px + w, py, zoom);
    renderLengthLabel(ctx, px, py, px, py + h, zoom);
  }
}
