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
  { value: 'LAN', label: 'LAN', color: '#3b82f6', badgeClass: 'bg-green-100 text-green-700' },
  { value: 'FIBER', label: 'FIBER', color: '#22c55e', badgeClass: 'bg-yellow-100 text-yellow-700' },
  { value: 'AC', label: 'AC', color: '#ef4444', badgeClass: 'bg-red-100 text-red-700' },
  { value: 'DC', label: 'DC', color: '#f97316', badgeClass: 'bg-blue-100 text-blue-700' },
  { value: 'GROUND', label: '접지', color: '#eab308', badgeClass: 'bg-gray-100 text-gray-700' },
];

/** Hex color lookup by cable type (for canvas) */
export const CABLE_COLORS: Record<string, string> = Object.fromEntries(
  CABLE_TYPES.map((t) => [t.value, t.color]),
);

/** Tailwind badge class lookup by cable type (for UI) */
export const CABLE_BADGE_CLASSES: Record<string, string> = Object.fromEntries(
  CABLE_TYPES.map((t) => [t.value, t.badgeClass]),
);

export interface EquipmentInfo {
  id: string;
  name: string;
  /**
   * @deprecated P8 — Equipment no longer has parentEquipmentId (rack children
   * are now `RackModule`). Adapter shape only; removed in P9.
   */
  parentEquipmentId: string | null;
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
  sourceEquipmentId: string;
  targetEquipmentId: string;
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
  pathLength?: number | null;
  totalLength?: number | null;
  sourceEquipment: EquipmentInfo;
  targetEquipment: EquipmentInfo;
}

/** Alias for floor-plan-scoped connections (same shape as RoomConnection) */
export type FloorPlanConnection = RoomConnection;
