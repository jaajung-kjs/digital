export const ROW_BASE = 'h-9 cursor-pointer border-b border-line transition-colors';
export const ROW_SELECTED = 'bg-info-bg shadow-[inset_3px_0_0_var(--primary)]';
export const ROW_HOVER = 'hover:bg-surface-2 active:bg-surface-3';
/** 선택/트레이스 강조 행 클래스. */
export const rowClass = (highlighted: boolean) => `${ROW_BASE} ${highlighted ? ROW_SELECTED : ROW_HOVER}`;
