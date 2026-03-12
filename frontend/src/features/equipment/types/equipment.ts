import type { EquipmentCategory } from '../../../types/rack';

export interface EquipmentFormData {
  name: string;
  model?: string;
  manufacturer?: string;
  serialNumber?: string;
  category: string;
  manager?: string;
  description?: string;
  positionX: number;
  positionY: number;
  width2d: number;
  height2d: number;
  rotation?: number;
  height3d?: number;
}

export interface MaintenanceFormData {
  logType: string;
  title: string;
  description?: string;
  logDate?: string;
  severity?: string;
  status?: string;
}

export const CATEGORY_ICONS = {
  NETWORK: '\u{1F310}',
  POWER: '\u26A1',
  DISTRIBUTION_BOARD: '\u{1F4CB}',
  OFD: '\u{1F4E6}',
} satisfies Record<EquipmentCategory, string> as Record<string, string>;

export const CATEGORY_LABELS = {
  NETWORK: '\uB124\uD2B8\uC6CC\uD06C',
  POWER: '\uC804\uC6D0',
  DISTRIBUTION_BOARD: '\uBD84\uC804\uBC18',
  OFD: 'OFD',
} satisfies Record<EquipmentCategory, string> as Record<string, string>;

export const EQUIPMENT_CATEGORIES = [
  'NETWORK',
  'POWER',
  'DISTRIBUTION_BOARD',
  'OFD',
] as const;

export const LOG_TYPE_LABELS: Record<string, string> = {
  MAINTENANCE: '점검',
  FAILURE: '고장',
  REPAIR: '수리',
};

export const LOG_TYPE_COLORS: Record<string, string> = {
  MAINTENANCE: 'bg-blue-100 text-blue-700',
  FAILURE: 'bg-red-100 text-red-700',
  REPAIR: 'bg-emerald-100 text-emerald-700',
};

export const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-800',
  HIGH: 'bg-orange-100 text-orange-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  LOW: 'bg-green-100 text-green-800',
};

export const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-800',
  IN_PROGRESS: 'bg-purple-100 text-purple-800',
  RESOLVED: 'bg-green-100 text-green-800',
  CLOSED: 'bg-gray-100 text-gray-800',
};

export const STATUS_LABELS: Record<string, string> = {
  OPEN: '\uC5F4\uB9BC',
  IN_PROGRESS: '\uC9C4\uD589\uC911',
  RESOLVED: '\uD574\uACB0',
  CLOSED: '\uC885\uB8CC',
};

export const CABLE_TYPE_COLORS: Record<string, string> = {
  AC: 'bg-red-100 text-red-700',
  DC: 'bg-blue-100 text-blue-700',
  LAN: 'bg-green-100 text-green-700',
  FIBER: 'bg-yellow-100 text-yellow-700',
  GROUND: 'bg-gray-100 text-gray-700',
};
