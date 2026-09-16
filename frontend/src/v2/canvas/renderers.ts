// ported from frontend/src/utils/floorplan/renderers.ts (Stage 3)

import { SELECTION_STYLES, ELEMENT_COLORS } from './constants';
import type { PlacedAsset } from './hitTest';
import { bundleCables, polylineMidpoint } from './cableBundles';
import { BUNDLE_GAP_PX, cableLineWidth } from './cableStyle';

// ============================================
// Asset 렌더링 (V2 필드: x/y/width/height, rotation 없음)
// ============================================

/**
 * 도면 주기의 크기 — **배율과 무관하게 화면에서 늘 같은 크기**다.
 *
 * 예전에는 글자를 상자에 맞춰 키웠다(9~40px 이분 탐색). 그래서 `UPS #1` 은 40px, 그 옆
 * 설비는 12px 이었다 — 크기가 중요도를 뜻하는 것처럼 읽히지만 아무 뜻도 없었다(상자가 커서
 * 커졌을 뿐이다). 무엇보다 **글자가 상자를 가득 채우면 상자가 「물건의 자리」가 아니라
 * 「글자를 담는 그릇」으로 읽힌다** — 실제 크기라는 인식이 안 드는 진짜 까닭이 이것이다.
 *
 * 도면은 반대로 한다: 물건은 실제 치수로 그리고, 주기는 읽을 수 있는 한 크기로 고정한다.
 */
const LABEL_PX = 12;
const SUB_PX = 10;
/** 주기가 들어갈 최소 크기(화면 px) — 이보다 작으면 적지 않는다. 잘린 글자보다 없는 편이 낫다. */
const LABEL_MIN_BOX_PX = 44;
const SUB_MIN_BOX_PX = 76;

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

/**
 * 정면이 보는 쪽 → 굵게 그을 변. 키는 선언된 값 그대로다(`COMMON_ASSET_FIELDS.facing`).
 *
 * 화면 좌표는 아래로 갈수록 y 가 커진다 — 「위」가 y, 「아래」가 y+h 인 까닭이다.
 */
const FRONT_EDGE: Record<string, ((x: number, y: number, w: number, h: number) => [number, number, number, number]) | undefined> = {
  '위': (x, y, w) => [x, y, x + w, y],
  '아래': (x, y, w, h) => [x, y + h, x + w, y + h],
  '왼쪽': (x, y, _w, h) => [x, y, x, y + h],
  '오른쪽': (x, y, w, h) => [x + w, y, x + w, y + h],
};

/** 캔버스 1 unit = 1 cm 약속 — 도면의 단위인 mm 로 적는다. */
const mm = (cm: number) => Math.round(cm * 10).toLocaleString();

function renderAssetItem(
  ctx: CanvasRenderingContext2D,
  item: PlacedAsset,
  isSelected: boolean,
  /** world → 화면 배율(px/cm). 선 굵기와 글자 크기를 화면 기준으로 고정하는 데 쓴다. */
  scale: number,
): void {
  const { x, y, width: w, height: h } = item;
  ctx.save();

  /* 선 굵기는 **화면 기준**으로 고정한다 — 배경 도면 임포터와 같은 규칙이다(그쪽은 cm 로
     저장된 선 굵기에 화면 px 바닥을 둔다). 설비 윤곽은 벽과 같은 굵기(0.5mm ≈ 1.6px)로
     서고, 골랐을 때만 굵어진다. */
  const px = (n: number) => n / Math.max(scale, 0.0001);
  ctx.fillStyle = isSelected ? SELECTION_STYLES.fill : ELEMENT_COLORS.rack.fill;
  ctx.strokeStyle = isSelected ? SELECTION_STYLES.stroke : ELEMENT_COLORS.rack.stroke;
  ctx.lineWidth = px(isSelected ? 2.4 : 1.6);
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);

  /* **정면은 굵은 변으로 그린다.** 반과 랙에는 앞이 있고, 앞이 벽을 보고 있으면 문을 열 수
     없다 — 배치 검토에서 가장 먼저 보는 것이다. 설비 도면의 관용구를 그대로 쓴다.
     적히지 않은 것에는 아무것도 긋지 않는다(모르는 것을 그리면 도면이 거짓말을 한다). */
  const edge = FRONT_EDGE[item.facing ?? ''];
  if (edge) {
    ctx.beginPath();
    const [x1, y1, x2, y2] = edge(x, y, w, h);
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = px(4);
    ctx.stroke();
  }

  /* 주기는 **상자 왼쪽 위**에 붙는다 — 가운데에 두면 글자가 상자의 내용물처럼 보인다.
     도면의 주기가 물건 옆에 붙는 것과 같은 자리다. */
  const boxW = w * scale;
  const boxH = h * scale;
  if (boxW >= LABEL_MIN_BOX_PX && boxH >= LABEL_MIN_BOX_PX) {
    const pad = px(6);
    const maxWidth = w - pad * 2;
    ctx.fillStyle = ELEMENT_COLORS.rack.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `600 ${px(LABEL_PX)}px sans-serif`;
    ctx.fillText(ellipsize(ctx, item.name, maxWidth), x + pad, y + pad);
    /* 실제 치수 — 「이 그림은 실측이다」를 말하는 한 줄. 좁으면 접는다. */
    if (boxW >= SUB_MIN_BOX_PX && boxH >= SUB_MIN_BOX_PX) {
      ctx.font = `${px(SUB_PX)}px ui-monospace, Menlo, monospace`;
      ctx.globalAlpha = 0.62;
      ctx.fillText(ellipsize(ctx, `${mm(w)} × ${mm(h)}`, maxWidth), x + pad, y + pad + px(LABEL_PX + 3));
      ctx.globalAlpha = 1;
    }
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
  /** world → 화면 배율(px/cm) — 선 굵기·글자 크기를 화면 기준으로 고정한다. */
  scale = 1,
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
    renderAssetItem(ctx, item, item.id === selectedId, scale);
  }
}

// ============================================
// 케이블 렌더링
// ============================================

export interface CableRenderSegment {
  /** 묶음의 대표를 고르고 선택 상태를 잇기 위해 필요하다. */
  id: string;
  /** 종류가 다르면 색이 다르므로 합치지 않는다 — 묶음 판정에 쓴다. */
  categoryId: string | null;
  points: { x: number; y: number }[];
  color: string;
  selected: boolean;
  /**
   * 이 도면을 **떠나는 회선**의 행선지 — 있으면 끝에 화살촉과 꼬리표를 그린다.
   *
   * 반대쪽 끝이 이 층에 없는 회선(OPGW 로 다른 국에 가는 광, 다른 층으로 가는 케이블)은
   * 선을 그을 두 점이 없어 도면에서 통째로 빠져 있었다 — 선번장에만 있고 도면에는 없었다.
   */
  outgoingLabel?: string;
}

/**
 * 케이블 세그먼트 목록을 폴리라인으로 렌더링.
 * 색상·선택 여부는 호출부(FloorPlanView)가 categoryId → group.color 맵핑 후 전달.
 * 선택 시 SELECTION_STYLES stroke 색으로 두껍게 표시.
 */
export function renderCables(
  ctx: CanvasRenderingContext2D,
  segments: CableRenderSegment[],
  /** 지금 배율(1 = 100%) — 선 굵기를 화면 기준으로 유지한다. */
  scale = 1,
): void {
  /* 같은 자리에 겹치는 케이블은 묶어서 그린다 — 함체 사이 케이블은 양 끝 자산 중심을
     잇는 같은 선이 되므로, 4본이든 1본처럼 보였다. 묶는 규칙은 cableBundles 참고. */
  /* 굵기도 다발 간격도 **화면 기준**이다 — 배율은 `cableStyle` 이 정한 만큼만 탄다. */
  for (const b of bundleCables(segments.map((s) => ({
    id: s.id,
    categoryId: s.categoryId,
    color: s.color,
    points: s.points,
    selected: s.selected,
    /* 같은 자리·같은 종류라도 **가는 곳이 다르면** 한 다발이 아니다. */
    bundleKey: s.outgoingLabel,
  })), BUNDLE_GAP_PX / scale)) {
    ctx.save();
    ctx.strokeStyle = b.selected ? SELECTION_STYLES.stroke : b.color;
    ctx.lineWidth = cableLineWidth(scale, b.selected) / scale;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(b.points[0]!.x, b.points[0]!.y);
    for (let i = 1; i < b.points.length; i++) {
      ctx.lineTo(b.points[i]!.x, b.points[i]!.y);
    }
    ctx.stroke();

    /* 나가는 회선 — 끝에 화살촉을 얹고 **어디로 가는지** 적는다(도면 밖으로 나가는 표시). */
    if (b.bundleKey) {
      const end = b.points[b.points.length - 1]!;
      const prev = b.points[b.points.length - 2] ?? end;
      const angle = Math.atan2(end.y - prev.y, end.x - prev.x);
      const stroke = b.selected ? SELECTION_STYLES.stroke : b.color;
      ctx.save();
      ctx.translate(end.x, end.y);
      ctx.rotate(angle);
      ctx.fillStyle = stroke;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-9, 4);
      ctx.lineTo(-9, -4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      /* 꼬리표는 화살촉 **너머**에 둔다 — 선 위에 얹으면 선과 글자가 서로를 가린다. */
      const label = b.count > 1 ? `${b.bundleKey} ×${b.count}` : b.bundleKey;
      ctx.font = '10px sans-serif';
      ctx.textAlign = Math.cos(angle) < 0 ? 'right' : 'left';
      ctx.textBaseline = 'middle';
      const tx = end.x + Math.cos(angle) * 6;
      const ty = end.y + Math.sin(angle) * 6;
      const w = ctx.measureText(label).width + 6;
      const left = ctx.textAlign === 'right' ? tx - w : tx;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(left, ty - 7, w, 14);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.strokeRect(left, ty - 7, w, 14);
      ctx.fillStyle = stroke;
      ctx.fillText(label, ctx.textAlign === 'right' ? tx - 3 : tx + 3, ty);
      ctx.restore();
      continue;
    }

    // 여러 본이면 몇 본인지 선 위에 적는다(업계 도면이 회선 수를 적는 방식).
    if (b.count > 1) {
      const mid = polylineMidpoint(b.points);
      const label = `×${b.count}`;
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const w = ctx.measureText(label).width + 6;
      // 선 위에 글자가 겹치지 않도록 배경을 깔아 준다.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(mid.x - w / 2, mid.y - 7, w, 14);
      ctx.strokeStyle = b.selected ? SELECTION_STYLES.stroke : b.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(mid.x - w / 2, mid.y - 7, w, 14);
      ctx.fillStyle = b.selected ? SELECTION_STYLES.stroke : b.color;
      ctx.fillText(label, mid.x, mid.y);
    }
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
