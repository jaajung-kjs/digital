/**
 * 캔버스 드로잉 관련 유틸리티 함수들
 * 스타일 적용, 색상 처리 등
 */

import { LINE_STYLES } from '../../types/floorPlan';

/**
 * 선 스타일 적용
 * @param ctx Canvas 2D 컨텍스트
 * @param strokeColor 선 색상
 * @param strokeWidth 선 굵기
 * @param strokeStyle 선 스타일 ('solid' | 'dashed' | 'dotted')
 * @param isSelected 선택 상태 여부
 */
export function applyStrokeStyle(
  ctx: CanvasRenderingContext2D,
  strokeColor: string,
  strokeWidth: number,
  strokeStyle: 'solid' | 'dashed' | 'dotted',
  isSelected: boolean
): void {
  ctx.strokeStyle = isSelected ? '#3b82f6' : strokeColor;
  ctx.lineWidth = strokeWidth;
  ctx.setLineDash(LINE_STYLES[strokeStyle]);
}

/**
 * 채움 스타일 적용
 * @param ctx Canvas 2D 컨텍스트
 * @param fillColor 채움 색상
 * @param isSelected 선택 상태 여부
 */
export function applyFillStyle(
  ctx: CanvasRenderingContext2D,
  fillColor: string,
  isSelected: boolean
): void {
  ctx.fillStyle = isSelected ? '#dbeafe' : fillColor;
}

/**
 * 선 스타일 초기화 (실선으로 복원)
 * @param ctx Canvas 2D 컨텍스트
 */
export function clearLineDash(ctx: CanvasRenderingContext2D): void {
  ctx.setLineDash([]);
}

/**
 * 선택 상태 하이라이트 스타일
 */
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
