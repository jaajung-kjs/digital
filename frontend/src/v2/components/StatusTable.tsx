import { useState } from 'react';
import type { ReactNode } from 'react';
import { ASSET_STATUSES, assetStatusLabel } from '@twin/core';
import { Badge, TableCard, Th } from '../../components/ui';
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
  /** table-fixed 기준 폭. */
  width: string;
  render: (row: StatusRow) => ReactNode;
}

const SUBSTATION_COL: Column = {
  key: 'substationName',
  label: '변전소',
  width: 'w-36',
  render: (r) => r.substationName ?? '—',
};

const BASE_COLS: Column[] = [
  { key: 'typeName', label: '종류', width: 'w-36', render: (r) => r.typeName },
  { key: 'name', label: '이름', width: 'w-56', render: (r) => r.name },
  { key: 'location', label: '설치장소', width: 'w-52', render: (r) => r.location },
  { key: 'installDate', label: '설치일', width: 'w-28', render: (r) => formatDate(r.installDate) },
  { key: 'manager', label: '담당자', width: 'w-24', render: (r) => r.manager ?? '—' },
  { key: 'lastInspectedAt', label: '마지막점검일', width: 'w-32', render: (r) => formatDate(r.lastInspectedAt) },
  {
    key: 'status',
    label: '상태',
    width: 'w-24',
    render: (r) => <Badge status={assetStatusBadge(r.status)}>{assetStatusLabel(r.status)}</Badge>,
  },
];

export function StatusTable({ rows, selectedId, onSelectAsset, nodeScope = false }: StatusTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [asc, setAsc] = useState(true);

  function handleHeaderClick(key: SortKey) {
    if (sortKey === key) {
      setAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setAsc(true);
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey] ?? null;
    const bv = b[sortKey] ?? null;
    const cmp = compareValues(av, bv);
    return asc ? cmp : -cmp;
  });

  const cols = nodeScope ? [SUBSTATION_COL, ...BASE_COLS] : BASE_COLS;

  return (
    <TableCard>
      <thead>
        {/* 머리글은 스크롤해도 남는다 — 긴 목록에서 어느 열인지 잃지 않게. */}
        <tr className="sticky top-0 z-sticky">
          {cols.map((col) => (
            <Th
              key={col.key}
              className={`cursor-pointer select-none hover:text-content ${col.width}`}
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
              <td colSpan={cols.length} className="px-3 py-6 text-center text-sm text-content-faint">
                <span className="block">자산이 없습니다</span>
                <span className="mt-1 block text-xs">위의 &lsquo;자산 추가&rsquo; 로 시작하세요</span>
              </td>
            </tr>
          )}
        {sorted.map((row) => (
            <tr
              key={row.id}
              className={`cursor-pointer border-b border-line last:border-0 hover:bg-surface-2 ${row.id === selectedId ? 'bg-surface-2' : ''}`}
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
  );
}
