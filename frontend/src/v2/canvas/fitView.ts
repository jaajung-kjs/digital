import { MAX_ZOOM, MIN_ZOOM, type Viewport } from './transform';

/**
 * 평면도를 열 때 **놓인 것들이 한눈에 들어오게** 뷰포트를 맞춘다.
 *
 * 예전에는 늘 도면 원점(0,0)·100%에서 시작했다. 그런데 자산 좌표는 배경 도면에 맞춰 놓이므로
 * 원점 근처에 있으리라는 보장이 없다 — 실제로 어떤 변전소는 설비가 (2600, 2600) 에 모여 있어
 * 평면도를 열면 **빈 격자만** 보였다. 어디로 밀어야 하는지도 화면이 말해 주지 않는다.
 *
 * 배경 도면은 셈에 넣지 않는다: 배경은 부지 전체를 담아 설비 무리보다 훨씬 크므로, 함께 맞추면
 * 정작 설비가 점만 해진다. 놓인 것이 하나도 없을 때만 배경을 본다(그때는 그것이 내용이다).
 */
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 사각형들과 점들을 모두 감싸는 상자 — 아무것도 없으면 `null`. */
export function contentBounds(
  rects: readonly Rect[],
  points: readonly { x: number; y: number }[] = [],
): Bounds | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

/** 내용 둘레의 여백(화면 px) — 설비가 가장자리에 붙어 서면 꼬리표·선이 잘린다. */
const PADDING = 48;
/**
 * 맞출 때의 최대 배율 — **한 대뿐이어도 크게 부풀리지 않는다.**
 *
 * 「한눈에」는 「꽉 채워라」가 아니다. 설비 하나짜리 층을 800% 로 열면 그 한 대만 화면을 채워
 * 어디에 놓인 것인지·주변이 비었는지가 사라진다. 100% 는 사람이 배치할 때 보던 크기다.
 */
const MAX_FIT_ZOOM = 100;

/**
 * 이 내용을 다 담는 뷰포트 — 화면 한가운데에 놓는다.
 *
 * 화면이 아직 크기를 모르면(첫 프레임) 맞출 수 없으므로 `null` 을 돌려준다 — 부르는 쪽이
 * 다음 프레임에 다시 묻는다.
 */
export function fitViewport(
  bounds: Bounds | null,
  canvas: { width: number; height: number },
): Viewport | null {
  if (!bounds || canvas.width <= 0 || canvas.height <= 0) return null;

  const w = Math.max(bounds.maxX - bounds.minX, 1);
  const h = Math.max(bounds.maxY - bounds.minY, 1);
  const usableW = Math.max(canvas.width - PADDING * 2, 1);
  const usableH = Math.max(canvas.height - PADDING * 2, 1);

  const scale = Math.min(usableW / w, usableH / h);
  const zoom = Math.min(Math.max(scale * 100, MIN_ZOOM), Math.min(MAX_FIT_ZOOM, MAX_ZOOM));
  const s = zoom / 100;

  /* 가운데 맞춤: 내용의 한가운데가 화면의 한가운데에 오도록 민다. */
  return {
    zoom,
    panX: canvas.width / 2 - ((bounds.minX + bounds.maxX) / 2) * s,
    panY: canvas.height / 2 - ((bounds.minY + bounds.maxY) / 2) * s,
  };
}
