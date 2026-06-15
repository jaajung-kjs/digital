import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';

/**
 * 컨테이너 자식(경로슬롯·랙 모듈 등) 타일 — 흰 모듈 룩(차단기·포트 그리드와 동일 디자인 언어):
 * bg-surface 바디 + 테두리 + shadow-sm + 좌측 식별 색 띠. **랙·OFD 공용 단일 비주얼**.
 * 드래그/리사이즈는 랙 전용이라 onPointerDown/footer 로 주입한다(중복 마크업 없음).
 *
 * - OFD: title/subtitle + onClick(선택) + onDelete(경로 삭제), accentClass=fiber 톤.
 * - 랙: title + meta(슬롯번호) + accentColor(카테고리색) + onPointerDown(이동) + footer(리사이즈 핸들).
 */
export function SlotTile({
  title,
  subtitle,
  meta,
  state = 'occupied',
  selected = false,
  accentClass = 'bg-info',
  accentColor,
  draggable = false,
  onClick,
  onDelete,
  onPointerDown,
  footer,
  style,
  className,
  ariaLabel,
  tooltip,
}: {
  title: string;
  subtitle?: ReactNode;
  /** 우측 보조 표기(예: 랙 슬롯 번호). */
  meta?: ReactNode;
  state?: 'occupied' | 'empty';
  selected?: boolean;
  /** 좌측 식별 색 띠 클래스(bg-*). 기본 fiber 톤(bg-info). */
  accentClass?: string;
  /** 좌측 띠 색 인라인값(카테고리색 등) — 주어지면 accentClass 보다 우선. */
  accentColor?: string | null;
  /** 드래그 가능 표시(cursor-grab + select-none). */
  draggable?: boolean;
  onClick?: () => void;
  onDelete?: () => void;
  onPointerDown?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  /** 하단 오버레이(랙 리사이즈 핸들 등). */
  footer?: ReactNode;
  style?: CSSProperties;
  className?: string;
  ariaLabel?: string;
  tooltip?: string;
}) {
  if (state === 'empty') {
    return (
      <button type="button" onClick={onClick} style={style}
        className={`group flex h-full w-full flex-col items-center justify-center rounded-md border border-dashed border-line bg-surface/40 text-xs text-content-faint transition-colors hover:border-primary hover:bg-info-bg hover:text-primary${className ? ` ${className}` : ''}`}>
        {title}
      </button>
    );
  }
  const interactive = !!onClick || !!onPointerDown;
  return (
    <div
      role="button"
      tabIndex={interactive ? 0 : -1}
      onClick={onClick}
      onKeyDown={(e) => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}
      onPointerDown={onPointerDown}
      style={style}
      aria-label={ariaLabel}
      title={tooltip}
      className={`group relative flex h-full w-full items-stretch gap-2 overflow-hidden rounded-md border bg-surface shadow-sm transition-colors ${
        draggable ? 'cursor-grab select-none' : onClick ? 'cursor-pointer' : 'cursor-default'
      } ${selected ? 'border-primary ring-2 ring-primary/40' : 'border-line hover:border-content-faint'}${className ? ` ${className}` : ''}`}
    >
      {/* 좌측 식별 색 띠 — 상·하단 여백으로 inset(하단 핸들과 겹치지 않게). */}
      <span aria-hidden
        className={`my-1.5 w-1 shrink-0 self-stretch rounded-full ${accentColor ? '' : accentClass}`}
        style={accentColor ? { background: accentColor } : undefined} />
      <div className="flex min-w-0 flex-1 flex-col justify-center py-1">
        <span className="truncate text-xs font-medium leading-tight text-content">{title}</span>
        {subtitle != null && <span className="truncate text-[11px] leading-tight text-content-muted">{subtitle}</span>}
      </div>
      {meta != null && (
        <span aria-hidden className="shrink-0 self-center pr-2 font-mono text-[10px] tabular-nums text-content-faint">{meta}</span>
      )}
      {onDelete && (
        <button type="button" aria-label="삭제" title="삭제"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full border border-line bg-surface text-[10px] leading-none text-danger opacity-0 shadow-sm transition-opacity hover:bg-danger-bg group-hover:opacity-100">
          ✕
        </button>
      )}
      {footer}
    </div>
  );
}
