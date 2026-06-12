/**
 * 캔버스 공용 스타일 상수.
 */

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
  // displayColor(설비 종류색)를 fill 로 쓰지 않고 eq-* 무채색 토큰으로 렌더 →
  // 기존 DB(보라/네온 displayColor)도 무채색으로 보인다.
  rack: {
    fill: '#e7e5e4',      // stone-200 (eq 계열 밝은 무채색)
    stroke: '#78716c',    // --eq-2
    text: '#44403c',      // --eq-1
  },
} as const;
