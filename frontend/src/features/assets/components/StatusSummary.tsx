// 현황 요약 칩 — 종류별 개수를 보여주며 클릭하면 그 종류로 리스트를 필터한다.
// (별도 "종류" 드롭다운을 대체) "전체" 또는 활성 칩을 다시 누르면 필터 해제.

export interface SummaryItem {
  key: string;
  label: string;
  count: number;
}

export function StatusSummary({
  total,
  items,
  active,
  onSelect,
}: {
  total: number;
  items: SummaryItem[];
  /** 현재 활성 종류 필터(빈 문자열이면 전체). */
  active?: string;
  /** 칩 클릭 — key 를 토글. 미지정이면 칩은 비대화형(읽기 표시)으로 렌더. */
  onSelect?: (key: string) => void;
}) {
  const interactive = !!onSelect;
  const base = 'text-xs px-2 py-1 rounded font-medium transition-colors';
  const chipClass = (selected: boolean) =>
    selected
      ? `${base} bg-primary text-white`
      : `${base} bg-surface-2 text-content-muted ${interactive ? 'press-btn hover:bg-info-bg hover:text-primary cursor-pointer' : ''}`;

  return (
    <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2 border-b border-line bg-surface">
      <button
        type="button"
        disabled={!interactive}
        onClick={() => onSelect?.('')}
        className={chipClass(!active)}
      >
        전체 {total}
      </button>
      {items.map((c) => (
        <button
          key={c.key}
          type="button"
          disabled={!interactive}
          onClick={() => onSelect?.(c.key)}
          className={chipClass(active === c.key)}
        >
          {c.label} {c.count}
        </button>
      ))}
    </div>
  );
}
