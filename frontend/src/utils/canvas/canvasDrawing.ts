/**
 * 캔버스 공용 스타일 상수.
 */

/** 선택 상태 하이라이트 스타일 */
export const SELECTION_STYLES = {
  stroke: '#3b82f6',      // blue-500
  fill: '#dbeafe',        // blue-100
  point: '#2563eb',       // blue-600
  pointRadius: 4,
} as const;

/**
 * 기본 스타일 상수
 */
export const DEFAULT_STYLES = {
  strokeColor: '#1a1a1a',
  strokeWidth: 2,
  fillColor: 'transparent',
  strokeStyle: 'solid' as const,
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
  rack: {
    fill: '#f3f4f6',      // gray-100
    stroke: '#374151',    // gray-700
    text: '#111827',      // gray-900
  },
} as const;
