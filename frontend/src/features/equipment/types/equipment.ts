
export interface EquipmentFormData {
  name: string;
  model?: string;
  manufacturer?: string;
  serialNumber?: string;
  manager?: string;
  description?: string;
  positionX: number;
  positionY: number;
  width2d: number;
  height2d: number;
  rotation?: number;
  height3d?: number;
  materialCategoryId?: string | null;
  materialCategoryCode?: string | null;
}

export interface MaintenanceFormData {
  logType: string;
  title: string;
  description?: string;
  logDate?: string;
  severity?: string;
  status?: string;
}

// 표시용 라벨 — 레거시 MAINTENANCE(점검) 행도 목록에서 올바르게 표시하기 위해 유지.
export const LOG_TYPE_LABELS: Record<string, string> = {
  MAINTENANCE: '점검',
  FAILURE: '고장',
  REPAIR: '수리',
};

/**
 * 고장이력 드롭다운에 노출하는 유형 — 점검(MAINTENANCE)은 제외(점검은 별도 점검 섹션).
 * 기본값은 FAILURE.
 */
export const FAILURE_LOG_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'FAILURE', label: '고장' },
  { value: 'REPAIR', label: '수리' },
];

export const LOG_TYPE_COLORS: Record<string, string> = {
  MAINTENANCE: 'bg-info-bg text-primary',
  FAILURE: 'bg-danger-bg text-danger',
  REPAIR: 'bg-success-bg text-success',
};

export const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'bg-danger-bg text-danger',
  HIGH: 'bg-warning-bg text-warning',
  MEDIUM: 'bg-warning-bg text-warning',
  LOW: 'bg-success-bg text-success',
};

export const SEVERITY_LABELS: Record<string, string> = {
  CRITICAL: '심각',
  HIGH: '높음',
  MEDIUM: '보통',
  LOW: '낮음',
};

export const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-info-bg text-primary',
  IN_PROGRESS: 'bg-info-bg text-primary',
  RESOLVED: 'bg-success-bg text-success',
  CLOSED: 'bg-surface-2 text-content-muted',
};

export const STATUS_LABELS: Record<string, string> = {
  OPEN: '\uC5F4\uB9BC',
  IN_PROGRESS: '\uC9C4\uD589\uC911',
  RESOLVED: '\uD574\uACB0',
  CLOSED: '\uC885\uB8CC',
};

