import type { EquipmentCategory } from '../../../types/enums';

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
  SERVER: '\u{1F5A5}',
  NETWORK: '\u{1F310}',
  STORAGE: '\u{1F4BE}',
  CHARGER: '\u{1F50C}',
  UPS: '\u{1F50B}',
  SECURITY: '\u{1F512}',
  OTHER: '\u{1F4E6}',
  DISTRIBUTION_BOARD: '\u{1F4CB}',
  OFD: '\u{1F4E6}',
} satisfies Record<EquipmentCategory, string> as Record<string, string>;

export const CATEGORY_LABELS = {
  SERVER: '서버',
  NETWORK: '네트워크',
  STORAGE: '스토리지',
  CHARGER: '충전기',
  UPS: 'UPS',
  SECURITY: '보안장비',
  OTHER: '기타',
  DISTRIBUTION_BOARD: '분전반',
  OFD: 'OFD',
} satisfies Record<EquipmentCategory, string> as Record<string, string>;

export const EQUIPMENT_CATEGORIES = [
  'SERVER',
  'NETWORK',
  'STORAGE',
  'CHARGER',
  'UPS',
  'SECURITY',
  'OTHER',
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
