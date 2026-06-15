import type { ReactNode } from 'react';

const FACEPLATE_BG = 'var(--eq-1)';
const FACEPLATE_FG = 'var(--eq-4)';
const BEZEL = 'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.28)';

/** 컨테이너 자식(경로슬롯·포트 등) 타일 — ModuleCell 페이스플레이트 룩 차용, 순수 표시 + 클릭/삭제.
 * className 은 루트 엘리먼트에 병합 — 슬롯 그리드 셀 안에서 h-full 로 꽉 채울 때 사용.
 */
export function SlotTile({ title, subtitle, state = 'occupied', selected = false, onClick, onDelete, className }: {
  title: string; subtitle?: ReactNode; state?: 'occupied' | 'empty';
  selected?: boolean; onClick?: () => void; onDelete?: () => void;
  className?: string;
}) {
  if (state === 'empty') {
    return (
      <button type="button" onClick={onClick}
        className={`group flex h-12 w-full flex-col items-center justify-center rounded-md border border-dashed border-line bg-surface-2/50 text-xs text-content-faint transition-colors hover:bg-info-bg hover:text-primary${className ? ` ${className}` : ''}`}>
        {title}
      </button>
    );
  }
  return (
    <div role="button" tabIndex={onClick ? 0 : -1} onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(); }}
      className={`group relative flex h-12 w-full ${onClick ? 'cursor-pointer' : 'cursor-default'} flex-col justify-center rounded-md px-2.5 py-1.5 text-left transition-shadow ${selected ? 'ring-2 ring-primary' : ''}${className ? ` ${className}` : ''}`}
      style={{ background: FACEPLATE_BG, color: FACEPLATE_FG, boxShadow: BEZEL }}>
      <span className="truncate text-[13px] font-medium">{title}</span>
      {subtitle != null && <span className="truncate text-[11px] opacity-70">{subtitle}</span>}
      {onDelete && (
        <button type="button" aria-label="삭제" title="삭제"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute right-1 top-1 rounded-full bg-black/30 px-1 text-[11px] leading-none text-white opacity-0 transition-opacity hover:bg-danger group-hover:opacity-100">
          ✕
        </button>
      )}
    </div>
  );
}
