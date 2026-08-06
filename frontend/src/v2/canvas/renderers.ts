// ported from frontend/src/utils/floorplan/renderers.ts (Stage 3)

import { SELECTION_STYLES, ELEMENT_COLORS } from './constants';
import type { PlacedAsset } from './hitTest';

// ============================================
// Asset 렌더링 (V2 필드: x/y/width/height, rotation 없음)
// ============================================

const fontSizeCache = new Map<string, number>();

/** 이보다 작으면 읽을 수 없다 — 더 줄이는 대신 말줄임한다. */
const MIN_LABEL_FONT = 9;

/** 주어진 폭에 들어갈 만큼만 남기고 … 를 붙인다(현재 ctx.font 기준). */
export function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? `${text.slice(0, lo)}…` : '…';
}

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
      let lo = MIN_LABEL_FONT;
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
    /* 최소 크기에서도 안 들어가면 **줄여서 말줄임**한다.
       예전에는 fillText 의 maxWidth 로 가로만 눌러 담았는데, 긴 이름은 6px 까지 줄어든 위에
       17% 까지 찌그러져 글자를 알아볼 수 없었다(측정값). 화면의 다른 목록이 전부
       `truncate` 로 말줄임하는 것과도 어긋났다. */
    ctx.fillText(ellipsize(ctx, item.name, maxWidth), x + w / 2, y + h / 2);
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

// ============================================
// 케이블 렌더링
// ============================================

export interface CableRenderSegment {
  points: { x: number; y: number }[];
  color: string;
  selected: boolean;
}

/**
 * 케이블 세그먼트 목록을 폴리라인으로 렌더링.
 * 색상·선택 여부는 호출부(FloorPlanView)가 categoryId → group.color 맵핑 후 전달.
 * 선택 시 SELECTION_STYLES stroke 색으로 두껍게 표시.
 */
export function renderCables(
  ctx: CanvasRenderingContext2D,
  segments: CableRenderSegment[],
): void {
  for (const seg of segments) {
    if (seg.points.length < 2) continue;
    ctx.save();
    ctx.strokeStyle = seg.selected ? SELECTION_STYLES.stroke : seg.color;
    ctx.lineWidth = seg.selected ? 3 : 1.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(seg.points[0]!.x, seg.points[0]!.y);
    for (let i = 1; i < seg.points.length; i++) {
      ctx.lineTo(seg.points[i]!.x, seg.points[i]!.y);
    }
    ctx.stroke();
    ctx.restore();
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
