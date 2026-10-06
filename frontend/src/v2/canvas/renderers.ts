import { SELECTION_STYLES, ELEMENT_COLORS } from './constants';
import type { PlacedRect } from './hitTest';

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
/**
 * 정면이 보는 쪽 → 굵게 그을 변. 키는 랙의 `facing` 값 그대로다(`model/types.ts` 의 `Facing`).
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
  item: PlacedRect,
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

  ctx.restore();
}

/**
 * 도면 주기 — **이름은 상자 안 가운데, 안 들어가면 상자 바로 아래 가운데.** 지시선은 없다.
 *
 * 지시선은 이웃 설비와 겹쳐 어느 이름이 어느 상자의 것인지 오히려 헷갈렸다. 이름은 자기 상자에
 * 붙어 있어야 읽힌다. 글자 크기는 화면 기준으로 고정이라(`LABEL_PX`) 상자가 작으면 안에
 * 들어가지 않는다 — 그때만 아래로 내린다. 긴 이름은 말줄임(…)으로 자른다.
 *
 * 자리는 **상자 크기만으로** 정해진다(이웃을 보지 않는다) — 설비 하나를 옮겨도 다른 주기가
 * 춤추지 않는다. 글자에는 바탕색 테를 둘러 겹쳐도 읽히게 한다(text halo).
 */
function renderLabel(
  ctx: CanvasRenderingContext2D,
  item: PlacedRect,
  scale: number,
  px: (n: number) => number,
): void {
  const { x, y, width: w, height: h } = item;
  ctx.save();
  ctx.font = `600 ${px(LABEL_PX)}px sans-serif`;
  ctx.fillStyle = ELEMENT_COLORS.rack.text;
  ctx.textAlign = 'center';
  const wPx = w * scale;
  const hPx = h * scale;
  const textPx = ctx.measureText(item.name).width * scale;
  const inside = textPx + 8 <= wPx && LABEL_PX + 4 <= hPx;
  const halo = (text: string, tx: number, ty: number) => {
    ctx.strokeStyle = ELEMENT_COLORS.plan.paper;
    ctx.lineWidth = px(3);
    ctx.lineJoin = 'round';
    ctx.strokeText(text, tx, ty);
    ctx.fillText(text, tx, ty);
  };
  if (inside) {
    ctx.textBaseline = 'middle';
    halo(item.name, x + w / 2, y + h / 2);
  } else {
    /* 아래 주기는 상자보다 넓어도 되지만 끝없이 길면 이웃을 덮는다 — 상자 폭의 두 배(최소 96px)까지. */
    const maxPx = Math.max(wPx * 2, 96);
    ctx.textBaseline = 'top';
    halo(ellipsize(ctx, item.name, px(maxPx)), x + w / 2, y + h + px(4));
  }
  ctx.restore();
}

/** 글자가 `maxWorld`(world 단위) 를 넘으면 끝을 `…` 로 줄인다. */
function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWorld: number): string {
  if (ctx.measureText(text).width <= maxWorld) return text;
  let n = text.length;
  while (n > 1 && ctx.measureText(`${text.slice(0, n)}…`).width > maxWorld) n--;
  return `${text.slice(0, n)}…`;
}

/**
 * 치수선 — 보조선 · 화살표 · mm 숫자.
 *
 * 가로는 상자 **위**, 세로는 상자 **오른쪽**에 붙는다(도면 관례). 크기는 전부 화면 기준이라
 * 배율을 바꿔도 굵기·글자·화살표가 그대로다 — 도면에서 치수선은 물건이 아니라 **주기**다.
 */
function renderDimensions(
  ctx: CanvasRenderingContext2D,
  item: PlacedRect,
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
  assets: PlacedRect[],
  selectedId: string | null,
  preview?: { id: string; x: number; y: number; width?: number; height?: number } | null,
  /** world → 화면 배율(px/cm) — 선 굵기·글자 크기를 화면 기준으로 고정한다. */
  scale = 1,
): void {
  const withPreview = (asset: PlacedRect): PlacedRect =>
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
    const item = withPreview(asset);
    renderLabel(ctx, item, scale, px);
    /* **치수선도 주기다** — 늘 맨 위에 선다. 상자 패스에서 그렸더니 뒤에 그려지는 이웃
       상자가 치수선과 숫자를 덮었다(겹쳐 놓인 설비에서 그대로 가려졌다). */
    if (item.id === selectedId) renderDimensions(ctx, item, px);
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
