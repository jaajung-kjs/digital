// ported from frontend/src/utils/canvas/canvasDrawing.ts (Stage 3)
import { canvasColor } from './theme';

/** 배치/이동/리사이즈 공통 스냅 그리드 (world 단위) */
export const SNAP_GRID = 10;

/**
 * 선택 상태 하이라이트 — 색은 **토큰이 정한다**(`--canvas-select*`).
 *
 * `pointRadius` 만 여기 남는다: 그것은 색이 아니라 치수라 CSS 변수로 둘 이유가 없다.
 * 값이 아니라 함수인 이유는 CSS 변수를 읽는 시점이 스타일이 붙은 뒤여야 하기 때문이다 —
 * 모듈이 평가되는 순간에 읽으면 빈 문자열이 굳는다.
 */
export const SELECTION_STYLES = {
  get stroke() { return canvasColor('canvas-select'); },
  get fill() { return canvasColor('canvas-select-fill'); },
  get point() { return canvasColor('canvas-select-point'); },
  pointRadius: 4,
} as const;

/** 요소 타입별 기본 색 — 마찬가지로 토큰에서 온다(`--plan-*`). */
export const ELEMENT_COLORS = {
  door: {
    get fill() { return canvasColor('plan-door-fill'); },
    get stroke() { return canvasColor('plan-door-stroke'); },
  },
  window: {
    get fill() { return canvasColor('plan-window-fill'); },
    get stroke() { return canvasColor('plan-window-stroke'); },
  },
  /** 도면의 바탕(종이) — 주기의 흰 테가 이 색으로 훑는다. */
  plan: {
    get paper() { return canvasColor('canvas-paper'); },
  },
  rack: {
    get fill() { return canvasColor('plan-rack-fill'); },
    get stroke() { return canvasColor('plan-rack-stroke'); },
    get text() { return canvasColor('plan-rack-text'); },
  },
} as const;
