// 고장이력(MaintenanceLog) 행 배지·드롭다운용 enum 맵. recordTypes.ts(ASSET_RECORD_TYPES)가 사용.

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


