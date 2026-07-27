import { useState } from 'react';
import { ASSET_STATUSES, assetStatusLabel } from '@twin/core';
import { Badge } from '../../components/ui/Badge';
import type { BadgeStatus } from '../../components/ui/Badge';
import type { StatusRow } from '../statusRows';

type SortKey = keyof Pick<StatusRow, 'typeName' | 'categoryName' | 'name' | 'location' | 'installDate' | 'manager' | 'lastInspectedAt' | 'status'>;

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

const BASE_COLS: { key: SortKey; label: string }[] = [
  { key: 'typeName', label: '종류' },
  { key: 'name', label: '이름' },
  { key: 'location', label: '설치장소' },
  { key: 'installDate', label: '설치일' },
  { key: 'manager', label: '담당자' },
  { key: 'lastInspectedAt', label: '마지막점검일' },
  { key: 'status', label: '상태' },
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
    const av = a[sortKey] as string | null;
    const bv = b[sortKey] as string | null;
    const cmp = compareValues(av, bv);
    return asc ? cmp : -cmp;
  });

  const cols = nodeScope
    ? [{ key: 'substationName' as unknown as SortKey, label: '변전소' }, ...BASE_COLS]
    : BASE_COLS;

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line">
            {cols.map((col) => (
              <th
                key={col.key as string}
                className="cursor-pointer select-none px-3 py-2 text-left text-xs font-medium text-content-muted hover:text-content"
                onClick={() => handleHeaderClick(col.key)}
              >
                {col.label}
                {sortKey === col.key && (
                  <span className="ml-1">{asc ? '↑' : '↓'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td
                colSpan={cols.length}
                className="px-3 py-6 text-center text-sm text-content-faint"
              >
                자산이 없습니다
              </td>
            </tr>
          )}
          {sorted.map((row) => (
            <tr
              key={row.id}
              className={`cursor-pointer border-b border-line hover:bg-surface-2 ${row.id === selectedId ? 'bg-surface-2' : ''}`}
              onClick={() => onSelectAsset(row.id)}
            >
              {nodeScope && (
                <td className="px-3 py-2 text-content">{row.substationName ?? '—'}</td>
              )}
              <td className="px-3 py-2 text-content">{row.typeName}</td>
              <td className="px-3 py-2 text-content">{row.name}</td>
              <td className="px-3 py-2 text-content">{row.location}</td>
              <td className="px-3 py-2 text-content">{formatDate(row.installDate)}</td>
              <td className="px-3 py-2 text-content">{row.manager ?? '—'}</td>
              <td className="px-3 py-2 text-content">{formatDate(row.lastInspectedAt)}</td>
              <td className="px-3 py-2">
                <Badge status={assetStatusBadge(row.status)}>
                  {assetStatusLabel(row.status)}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
