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
  rackId: string | null;
  floorId: string | null;
}

/** API 응답 구조 (flat) */
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
  materialCategoryId?: string | null;
  materialCategoryCode?: string | null;
  displayColor?: string | null;
  materialId?: string | null;
  specParams?: Record<string, unknown> | null;
  pathLength?: number | null;
  totalLength?: number | null;
  sourceEquipment: EquipmentInfo;
  targetEquipment: EquipmentInfo;
}

/** Alias for floor-plan-scoped connections (same shape as RoomConnection) */
export type FloorPlanConnection = RoomConnection;
