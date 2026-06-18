import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import type { SortDir } from './useGridSort';

const padOf = (first?: boolean, last?: boolean) => (first ? 'pl-4 pr-2' : last ? 'px-2 pr-4' : 'px-2');

/** 현황·케이블 그리드 공용 헤더 셀. sortable=false 면 정적(클릭 무동작). */
export function SortableHeaderCell({ label, width, first, last, sortable = false, active = false, dir = 'asc', onClick }: {
  label: string; width?: string; first?: boolean; last?: boolean;
  sortable?: boolean; active?: boolean; dir?: SortDir; onClick?: () => void;
}) {
  const pad = padOf(first, last);
  if (!sortable) {
    return <th className={`text-xs font-medium tracking-wide text-content-muted whitespace-nowrap ${pad} py-2 ${width ?? ''}`}>{label}</th>;
  }
  return (
    <th aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`p-0 text-xs font-medium tracking-wide whitespace-nowrap ${active ? 'bg-surface-3' : ''} ${width ?? ''}`}>
      <button type="button" onClick={onClick} aria-label={`${label} 정렬`}
        className={`group w-full inline-flex items-center gap-1 ${pad} py-2 cursor-pointer select-none transition-colors hover:bg-surface-3 active:bg-surface-3 ${active ? 'text-content font-semibold' : 'text-content-muted'}`}>
        {label}
        {active && dir === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-content shrink-0" />
          : active && dir === 'desc' ? <ChevronDown className="w-3.5 h-3.5 text-content shrink-0" />
          : <ChevronsUpDown className="w-3.5 h-3.5 text-content-faint shrink-0" />}
      </button>
    </th>
  );
}
