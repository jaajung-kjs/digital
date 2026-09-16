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

  /* **고른 것에는 치수선이 붙는다.** 「이 그림은 실측이다」를 말하는 도면의 장치다 —
     보조선·화살표·숫자 한 벌. 늘 그리면 도면이 숫자로 뒤덮이므로 고른 것에만 붙인다. */
  if (isSelected) renderDimensions(ctx, item, px);

  ctx.restore();
}

/**
 * 도면 주기 — **이름은 상자 밖으로, 지시선으로 잇는다.**
 *
 * 한때 이름을 상자 안에 적었다. 그러면 두 가지가 생긴다: 상자가 좁아지는 순간 글자가
 * `통신용 충전…` 으로 잘리다 아예 사라지고, 배경에 건축 도면이 깔리면 글자가 벽·치수선과
 * 겹쳐 읽히지 않는다. 무엇보다 **글자가 상자를 채우면 상자가 「물건의 자리」가 아니라
 * 「글자를 담는 그릇」으로 읽힌다.**
 *
 * 도면은 반대로 한다: 물건은 실제 치수로만 그리고, 이름은 **밖에 적고 선으로 가리킨다**.
 * 그러면 배율과 무관하게 늘 읽히고, 남은 사각형은 오직 물건이 차지한 자리가 된다.
 *
 * 방향은 **늘 오른쪽 위**로 고정이다. 「비어 있는 쪽으로 피한다」 같은 규칙을 두면 아무
 * 상관없는 설비를 하나 옮길 때마다 온 도면의 주기가 춤춘다 — 인출선에서 이미 겪은 일이다.
 */
function renderLeaderLabel(
  ctx: CanvasRenderingContext2D,
  item: PlacedAsset,
  px: (n: number) => number,
): void {
  const { x, y, width: w } = item;
  const sx = x + w;
  const sy = y;
  const mx = sx + px(16);
  const my = sy - px(16);
  const ex = mx + px(10);

  ctx.save();
  ctx.strokeStyle = ELEMENT_COLORS.rack.stroke;
  ctx.fillStyle = ELEMENT_COLORS.rack.text;
  ctx.lineWidth = px(1);
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(mx, my);
  ctx.lineTo(ex, my);
  ctx.stroke();
  /* 지시선이 가리키는 끝에 점을 찍는다 — 어느 상자의 주기인지 한눈에 붙는다. */
  ctx.beginPath();
  ctx.arc(sx, sy, px(1.8), 0, Math.PI * 2);
  ctx.fill();

  /**
   * 이름은 지시선 **위**, 치수는 **아래**(도면 관례 — 주기는 선을 걸치고 앉는다).
   *
   * **글자에 흰 테를 두른다.** 주기는 상자 밖에 앉으므로 이웃의 선·주기와 겹칠 수밖에 없다.
   * 자리를 피해 다니게 만들면 아무 상관없는 설비 하나를 옮길 때마다 온 도면의 주기가 춤춘다
   * — 인출선에서 이미 겪은 일이다. CAD·GIS 는 대신 **글자 둘레를 바탕색으로 훑어** 겹쳐도
   * 읽히게 한다(text halo). 자리는 고정, 읽힘은 테가 맡는다.
   */
  const halo = (text: string, tx: number, ty: number) => {
    ctx.strokeStyle = ELEMENT_COLORS.plan.paper;
    ctx.lineWidth = px(3);
    ctx.lineJoin = 'round';
    ctx.strokeText(text, tx, ty);
    ctx.fillText(text, tx, ty);
  };
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.font = `600 ${px(LABEL_PX)}px sans-serif`;
  halo(item.name, ex + px(4), my - px(3));
  ctx.textBaseline = 'top';
  ctx.font = `${px(SUB_PX)}px ui-monospace, Menlo, monospace`;
  ctx.globalAlpha = 0.72;
  halo(`${mm(item.width)} × ${mm(item.height)}`, ex + px(4), my + px(2));
  ctx.restore();
}

/**
 * 치수선 — 보조선 · 화살표 · mm 숫자.
 *
 * 가로는 상자 **위**, 세로는 상자 **오른쪽**에 붙는다(도면 관례). 크기는 전부 화면 기준이라
 * 배율을 바꿔도 굵기·글자·화살표가 그대로다 — 도면에서 치수선은 물건이 아니라 **주기**다.
 */
function renderDimensions(
  ctx: CanvasRenderingContext2D,
  item: PlacedAsset,
  px: (n: number) => number,
): void {
  const { x, y, width: w, height: h } = item;
  const gap = px(10);   // 상자에서 치수선까지
  const tick = px(5);   // 보조선이 치수선 너머로 나가는 길이
  const head = px(4);   // 화살촉

  ctx.save();
  ctx.strokeStyle = SELECTION_STYLES.stroke;
  ctx.fillStyle = SELECTION_STYLES.stroke;
  ctx.lineWidth = px(1);

  /* 가로 — 상자 위 */
  const ty = y - gap;
  ctx.beginPath();
  ctx.moveTo(x, y - tick); ctx.lineTo(x, ty - tick);
  ctx.moveTo(x + w, y - tick); ctx.lineTo(x + w, ty - tick);
  ctx.moveTo(x, ty); ctx.lineTo(x + w, ty);
  ctx.stroke();
  arrow(ctx, x, ty, 1, 0, head);
  arrow(ctx, x + w, ty, -1, 0, head);

  /* 세로 — 상자 오른쪽 */
  const rx = x + w + gap;
  ctx.beginPath();
  ctx.moveTo(x + w + tick, y); ctx.lineTo(rx + tick, y);
  ctx.moveTo(x + w + tick, y + h); ctx.lineTo(rx + tick, y + h);
  ctx.moveTo(rx, y); ctx.lineTo(rx, y + h);
  ctx.stroke();
  arrow(ctx, rx, y, 0, 1, head);
  arrow(ctx, rx, y + h, 0, -1, head);

  ctx.font = `${px(10)}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(mm(w), x + w / 2, ty - px(3));
  /* 세로 숫자는 눕힌다 — 치수선을 따라 읽는 것이 도면의 어법이다. */
  ctx.save();
  ctx.translate(rx + px(3), y + h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textBaseline = 'top';
  ctx.fillText(mm(h), 0, 0);
  ctx.restore();

  ctx.restore();
}

/** 화살촉 하나 — `(dx,dy)` 는 **가리키는 반대 방향**(선이 뻗어 나가는 쪽)이다. */
function arrow(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, dx: number, dy: number, size: number,
): void {
  const px2 = -dy;
  const py2 = dx;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dx * size * 2 + px2 * size, y + dy * size * 2 + py2 * size);
  ctx.lineTo(x + dx * size * 2 - px2 * size, y + dy * size * 2 - py2 * size);
  ctx.closePath();
  ctx.fill();
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
  const withPreview = (asset: PlacedAsset): PlacedAsset =>
    preview && asset.id === preview.id
      ? { ...asset, x: preview.x, y: preview.y,
          width: preview.width ?? asset.width, height: preview.height ?? asset.height }
      : asset;

  /* **두 번 돈다: 상자를 다 그린 뒤에 주기를 그린다.**
     한 번에 돌면 뒤에 그려지는 상자가 앞 상자의 주기를 덮는다 — 주기는 상자 밖에 앉으므로
     이웃과 겹칠 수밖에 없고, 도면에서 주기는 늘 물건 위에 얹힌다. */
  for (const asset of assets) {
    const item = withPreview(asset);
    renderAssetItem(ctx, item, item.id === selectedId, scale);
  }
  const px = (n: number) => n / Math.max(scale, 0.0001);
  for (const asset of assets) {
    renderLeaderLabel(ctx, withPreview(asset), px);
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
