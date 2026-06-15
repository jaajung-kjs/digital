import type { ReactNode } from 'react';

/**
 * 컨테이너 자식(경로슬롯·포트 등) 타일 — 흰 모듈 룩(차단기·포트 그리드와 동일 디자인 언어):
 * bg-surface 바디 + 테두리 + shadow-sm, 좌측 식별 색 띠(accentClass). 순수 표시 + 클릭/삭제.
 * className 은 루트에 병합 — 슬롯 그리드 셀 안에서 h-full 로 꽉 채울 때 사용.
 */
export function SlotTile({
  title,
  subtitle,
  state = 'occupied',
  selected = false,
  accentClass = 'bg-info',
  onClick,
  onDelete,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  state?: 'occupied' | 'empty';
  selected?: boolean;
  /** 좌측 식별 색 띠 클래스(bg-*). 기본 fiber 톤(bg-info). */
  accentClass?: string;
  onClick?: () => void;
  onDelete?: () => void;
  className?: string;
}) {
  if (state === 'empty') {
    return (
      <button type="button" onClick={onClick}
        className={`group flex h-12 w-full flex-col items-center justify-center rounded-md border border-dashed border-line bg-surface/40 text-xs text-content-faint transition-colors hover:border-primary hover:bg-info-bg hover:text-primary${className ? ` ${className}` : ''}`}>
        {title}
      </button>
    );
  }
  return (
    <div role="button" tabIndex={onClick ? 0 : -1} onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(); }}
      className={`group relative flex h-full w-full items-center gap-2 rounded-md border bg-surface py-1.5 pl-1.5 pr-2.5 text-left shadow-sm transition-colors ${onClick ? 'cursor-pointer' : 'cursor-default'} ${
        selected ? 'border-primary ring-2 ring-primary/40' : 'border-line hover:border-content-faint'
      }${className ? ` ${className}` : ''}`}>
      {/* 좌측 식별 색 띠. */}
      <span aria-hidden className={`w-1 self-stretch shrink-0 rounded-full ${accentClass}`} />
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-content">{title}</span>
        {subtitle != null && <span className="block truncate text-[11px] text-content-muted">{subtitle}</span>}
      </div>
      {onDelete && (
        <button type="button" aria-label="삭제" title="삭제"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full border border-line bg-surface text-[10px] leading-none text-danger opacity-0 shadow-sm transition-opacity hover:bg-danger-bg group-hover:opacity-100">
          ✕
        </button>
      )}
    </div>
  );
}
