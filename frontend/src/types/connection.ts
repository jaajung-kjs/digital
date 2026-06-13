import type { CableType } from './enums';
export type { CableType };

/** Single source of truth for cable type metadata */
export interface CableTypeMeta {
  value: CableType;
  label: string;
  /** Hex color for canvas rendering */
  color: string;
  /** Tailwind classes for UI badges */
  badgeClass: string;
}

export const CABLE_TYPES: CableTypeMeta[] = [
  { value: 'LAN', label: 'LAN', color: '#3b82f6', badgeClass: 'bg-success-bg text-success' },
  { value: 'FIBER', label: 'FIBER', color: '#22c55e', badgeClass: 'bg-warning-bg text-warning' },
  { value: 'AC', label: 'AC', color: '#ef4444', badgeClass: 'bg-danger-bg text-danger' },
  { value: 'DC', label: 'DC', color: '#f97316', badgeClass: 'bg-info-bg text-primary' },
  { value: 'GROUND', label: '접지', color: '#eab308', badgeClass: 'bg-surface-2 text-content-muted' },
];

/** Hex color lookup by cable type (for canvas) */
export const CABLE_COLORS: Record<string, string> = Object.fromEntries(
  CABLE_TYPES.map((t) => [t.value, t.color]),
);

/** Tailwind badge class lookup by cable type (for UI) */
export const CABLE_BADGE_CLASSES: Record<string, string> = Object.fromEntries(
  CABLE_TYPES.map((t) => [t.value, t.badgeClass]),
);

/**
 * 레거시 보라색 폴백 — 제어(control) 케이블이 DB 에 `displayColor='#a855f7'`(보라)로
 * 시드돼 있던 데이터가 재시드 전까지 남아 있다. 디자인 시스템에서 제어 케이블은
 * 슬레이트(#64748b)로 통일됐으므로, 저장된 보라 계열 값을 슬레이트로 매핑한다.
 * (재시드 없이 OLD 데이터가 슬레이트로 렌더되도록 하는 가드.)
 */
const LEGACY_PURPLE = new Set(['#a855f7', '#8b5cf6', '#7c3aed']);
const SLATE = '#64748b';

/** 저장된 케이블 색을 정규화: 레거시 보라 → 슬레이트. null/undefined 는 그대로. */
export function normalizeCableColor<T extends string | null | undefined>(color: T): T {
  if (typeof color === 'string' && LEGACY_PURPLE.has(color.toLowerCase())) {
    return SLATE as T;
  }
  return color;
}

export interface EndpointInfo {
  id: string;
  name: string;
  floorId: string | null;
}

/**
 * API 응답 구조 (flat) — legacy room/connection 응답.
 *
 * NOTE (P8): cable category 메타는 신규 `categoryId/Code/Name` 그리고 legacy
 * `materialCategoryId/Code` 둘 다 노출한다. P9 에서 신규 필드만 사용하도록 정리.
 */
export interface RoomConnection {
  id: string;
  sourceAssetId: string;
  targetAssetId: string;
  cableType: CableType;
  label?: string;
  length?: number;
  color?: string;
  pathPoints?: [number, number][];
  description?: string;
  fiberPathId?: string | null;
  fiberPortNumber?: number | null;
  fiberPathDescription?: string | null;
  /** @deprecated P8 — use `categoryId`. */
  materialCategoryId?: string | null;
  /** @deprecated P8 — use `categoryCode`. */
  materialCategoryCode?: string | null;
  /** @deprecated P8 — Material model removed; always null. */
  materialId?: string | null;
  /** New cable-category fields (P8). */
  categoryId?: string | null;
  categoryCode?: string | null;
  categoryName?: string | null;
  displayColor?: string | null;
  specParams?: Record<string, unknown> | null;
  sourceRole?: 'IN' | 'OUT' | null;
  targetRole?: 'IN' | 'OUT' | null;
  pathLength?: number | null;
  totalLength?: number | null;
  sourceEndpoint: EndpointInfo;
  targetEndpoint: EndpointInfo;
}
