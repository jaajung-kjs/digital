/**
 * 캔버스가 쓰는 색 — **화면의 나머지와 같은 토큰에서** 가져온다.
 *
 * 캔버스는 클래스가 아니라 문자열로 칠한다(`ctx.strokeStyle = '#15406b'`). 그래서 색이
 * TS 파일에 hex 로 굳어 있었고, 디자인 토큰을 고쳐도 도면만 옛 색으로 남았다 — 같은 앱인데
 * 두 벌의 팔레트를 들고 있던 셈이다. 값은 이제 CSS 변수 한 곳에 있다(`--canvas-*`·`--plan-*`).
 *
 * 읽은 값은 담아 둔다: 칠할 때마다 `getComputedStyle` 을 부르면 프레임마다 스타일 재계산이
 * 걸린다. 테마를 바꾸는 길이 생기면 그때 담아 둔 것을 비우는 함수를 두면 된다 —
 * 지금은 그 길이 없어서 두지 않는다(부르는 데 없는 문은 시간이 지나면 거짓말이 된다).
 */
export type CanvasToken =
  | 'canvas-grid-major' | 'canvas-grid-minor' | 'canvas-origin'
  | 'canvas-select' | 'canvas-select-fill' | 'canvas-select-point'
  | 'plan-door-fill' | 'plan-door-stroke'
  | 'plan-window-fill' | 'plan-window-stroke'
  | 'plan-rack-fill' | 'plan-rack-stroke' | 'plan-rack-text';

const cache = new Map<CanvasToken, string>();

/** 그 토큰의 색. 스타일이 아직 안 붙었으면 검정으로 물러선다(안 보이는 것보다 낫다). */
export function canvasColor(token: CanvasToken): string {
  const hit = cache.get(token);
  if (hit !== undefined) return hit;
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim();
  const resolved = value || '#000';
  cache.set(token, resolved);
  return resolved;
}

