// ported from frontend/src/utils/canvas/canvasDrawing.ts (Stage 3)

/** 배치/이동/리사이즈 공통 스냅 그리드 (world 단위) */
export const SNAP_GRID = 10;

/** 선택 상태 하이라이트 스타일 */
export const SELECTION_STYLES = {
  stroke: '#15406b',      // primary navy (비즈니스 UI 선택색)
  fill: '#d8e3ef',        // 연한 navy 틴트
  point: '#0f3050',       // 진한 navy
  pointRadius: 4,
} as const;

/**
 * 요소 타입별 기본 색상
 */
export const ELEMENT_COLORS = {
  door: {
    fill: '#fef3c7',      // amber-100
    stroke: '#d97706',    // amber-600
  },
  window: {
    fill: '#e0f2fe',      // sky-100
    stroke: '#0284c7',    // sky-600
  },
  // ISA-101: 설비는 무채색(NEUTRAL). 색은 상태에만 사용한다.
  rack: {
    fill: '#e7e5e4',      // stone-200 (eq 계열 밝은 무채색)
    stroke: '#78716c',    // --eq-2
    text: '#44403c',      // --eq-1
  },
} as const;
