import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ASSET_STATUSES, assetStatusLabel } from '@twin/core';
import { Badge, EmptyState, Input, TableCard, Th, cn, SELECTABLE, SELECTED } from '../../components/ui';
import type { BadgeStatus } from '../../components/ui';
import type { StatusRow } from '../statusRows';

type SortKey = keyof Pick<
  StatusRow,
  | 'typeName'
  | 'categoryName'
  | 'name'
  | 'location'
  | 'installDate'
  | 'manager'
  | 'lastInspectedAt'
  | 'status'
  | 'substationName'
>;

function toneToStatus(tone: string): BadgeStatus {
  if (tone === 'success') return 'success';
  if (tone === 'danger') return 'danger';
  return 'neutral';
}

function assetStatusBadge(value: string): BadgeStatus {
  const entry = ASSET_STATUSES.find((s) => s.value === value);
  return entry ? toneToStatus(entry.tone) : 'neutral';
}

function compareValues(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b, 'ko');
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return value.slice(0, 10);
}

interface StatusTableProps {
  rows: StatusRow[];
  selectedId: string | null;
  onSelectAsset: (id: string) => void;
  nodeScope?: boolean;
}

/**
 * 열 정의는 여기 한 곳뿐이다 — 라벨·폭·본문 렌더를 함께 둔다.
 *
 * 이전에는 머리글을 도는 배열과 본문 `<td>` 나열이 따로 있어, 열을 하나 추가하면 두 곳을
 * 같이 고쳐야 어긋나지 않았다. 폭도 없어 넓은 화면에서 "설치일" 같은 짧은 열이 200px 로
 * 벌어졌다. 이제 모든 열이 폭을 갖고, 표 전체는 읽기 좋은 폭에서 멈춘다.
 */
interface Column {
  key: SortKey;
  label: string;
  /** 열 폭 비율(%). 합이 100 이 되게 맞춘다. */
  width: number;
  render: (row: StatusRow) => ReactNode;
}

const SUBSTATION_COL: Column = {
  key: 'substationName',
  label: '변전소',
  width: 14,
  render: (r) => r.substationName ?? '—',
};

const BASE_COLS: Column[] = [
  { key: 'typeName', label: '종류', width: 14, render: (r) => r.typeName },
  { key: 'name', label: '이름', width: 20, render: (r) => r.name },
  { key: 'location', label: '설치장소', width: 18, render: (r) => r.location },
  { key: 'installDate', label: '설치일', width: 13, render: (r) => formatDate(r.installDate) },
  { key: 'manager', label: '담당자', width: 10, render: (r) => r.manager ?? '—' },
  { key: 'lastInspectedAt', label: '마지막점검일', width: 13, render: (r) => formatDate(r.lastInspectedAt) },
  {
    key: 'status',
    label: '상태',
    width: 12,
    render: (r) => <Badge status={assetStatusBadge(r.status)}>{assetStatusLabel(r.status)}</Badge>,
  },
];

export function StatusTable({ rows, selectedId, onSelectAsset, nodeScope = false }: StatusTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [asc, setAsc] = useState(true);
  const [query, setQuery] = useState('');

  /* 검색이 없으면 자산이 수백 개가 됐을 때 찾을 방법이 정렬뿐이다.
     표에 보이는 값(종류·이름·설치장소·담당자)을 통째로 훑는다 — 어느 열인지 고르게 하지
     않는 이유는, 사용자는 보통 "그 이름" 하나만 기억하지 그것이 몇 번째 열인지는 모르기 때문. */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.typeName, r.name, r.location, r.manager, r.substationName]
        .some((v) => (v ?? '').toLowerCase().includes(q)),
    );
  }, [rows, query]);

  function handleHeaderClick(key: SortKey) {
    if (sortKey === key) {
      setAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setAsc(true);
    }
  }

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey] ?? null;
    const bv = b[sortKey] ?? null;
    const cmp = compareValues(av, bv);
    return asc ? cmp : -cmp;
  });

  const cols = nodeScope ? [SUBSTATION_COL, ...BASE_COLS] : BASE_COLS;

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-2">
      <div className="flex max-w-6xl items-center gap-2">
        <div className="w-64">
          <Input
            size="sm"
            aria-label="자산 검색"
            placeholder="이름 · 종류 · 설치장소 · 담당자 검색"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
          />
        </div>
        <span className="text-xs text-content-muted">
          {query.trim() ? `${filtered.length} / ${rows.length}건` : `${rows.length}건`}
        </span>
      </div>

    <TableCard widths={cols.map((c) => c.width)}>
      <thead>
        {/* 머리글은 스크롤해도 남는다 — 긴 목록에서 어느 열인지 잃지 않게. */}
        <tr className="sticky top-0 z-sticky">
          {cols.map((col) => (
            <Th
              key={col.key}
              className="cursor-pointer select-none hover:text-content"
              onClick={() => handleHeaderClick(col.key)}
            >
              {col.label}
              {sortKey === col.key && <span className="ml-1">{asc ? '↑' : '↓'}</span>}
            </Th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.length === 0 && (
            <tr>
              <td colSpan={cols.length}>
                {query.trim() ? (
                  <EmptyState title="검색 결과가 없습니다" description={`'${query.trim()}' 와 맞는 자산이 없습니다.`} />
                ) : (
                  <EmptyState title="자산이 없습니다" description="위의 '자산 추가' 로 시작하세요." />
                )}
              </td>
            </tr>
          )}
        {sorted.map((row) => (
            <tr
              key={row.id}
              className={cn('border-b border-line last:border-0', SELECTABLE, row.id === selectedId && SELECTED)}
              onClick={() => onSelectAsset(row.id)}
            >
              {cols.map((col) => (
                <td key={col.key} className="truncate px-3 py-2 text-content">
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
      </tbody>
    </TableCard>
    </div>
  );
}
