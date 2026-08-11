import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { ASSET_STATUSES, assetStatusLabel } from '@twin/core';
import { EmptyState, StatusDot, TableCard, TableSearch, Th, cn, SELECTABLE, SELECTED } from '../../components/ui';
import type { BadgeStatus } from '../../components/ui';
import type { StatusRow } from '../statusRows';
import type { StatusRowsResult } from '../statusRows';

type FieldDef = StatusRowsResult['fieldColumns'][number];


/** 상태 어휘가 선언한 톤을 화면 톤으로 옮긴다 — 모르는 톤은 조용한 쪽으로 둔다. */
const KNOWN_TONES: ReadonlySet<string> = new Set<BadgeStatus>([
  'success',
  'warning',
  'danger',
  'info',
  'neutral',
]);

function assetStatusTone(value: string): BadgeStatus {
  const tone = ASSET_STATUSES.find((s) => s.value === value)?.tone;
  return tone != null && KNOWN_TONES.has(tone) ? (tone as BadgeStatus) : 'neutral';
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
  /** 표에 열로 세울 커스텀 필드 — 타입 선언에서 나온다(`buildStatusRows` 참고). */
  fieldColumns: FieldDef[];
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
  key: string;
  label: string;
  /** 열 폭 **가중치**. 합이 얼마든 상관없다 — 아래에서 100 으로 정규화한다.
   *  커스텀 필드 열은 개수를 미리 알 수 없어 절대 비율로는 합을 맞출 수 없다. */
  weight: number;
  /** 정렬·검색이 쓰는 문자열 값. 화면 표시(`render`)와 달리 `—` 같은 장식이 없다. */
  value: (row: StatusRow) => string | null;
  render: (row: StatusRow) => ReactNode;
}

const SUBSTATION_COL: Column = {
  key: 'substationName',
  label: '변전소',
  weight: 14,
  value: (r) => r.substationName ?? null,
  render: (r) => r.substationName ?? '—',
};

/** 타입 선언과 무관하게 모든 자산이 갖는 것들 — 구조(종류·이름·자리)와 이력·상태. */
const STRUCTURAL_COLS: Column[] = [
  { key: 'typeName', label: '종류', weight: 14, value: (r) => r.typeName, render: (r) => r.typeName },
  { key: 'name', label: '이름', weight: 20, value: (r) => r.name, render: (r) => r.name },
  /* 「설치장소」 열은 없앴다 — 자리는 표에서 이미 두 번 말한다. 설비는 이름이 곧 자리이고
     (「판암 OFD」), 부품은 그 설비 밑에 물려 나오므로 어느 판에 꽂혔는지가 줄의 위치다.
     `location` 자체는 남는다 — 아래에서 같은 설비의 부품 차례를 정할 때 쓴다. */
];

const TRAILING_COLS: Column[] = [
  {
    key: 'lastInspectedAt',
    label: '마지막점검일',
    weight: 13,
    value: (r) => r.lastInspectedAt,
    render: (r) => formatDate(r.lastInspectedAt),
  },
  {
    key: 'status',
    label: '상태',
    weight: 12,
    value: (r) => assetStatusLabel(r.status),
    render: (r) => <StatusDot status={assetStatusTone(r.status)}>{assetStatusLabel(r.status)}</StatusDot>,
  },
];

/** 선언된 필드 하나 → 열 하나. 날짜는 날짜로 보이게 하되, 그 외에는 값을 그대로 적는다. */
function fieldColumn(fd: FieldDef): Column {
  const read = (r: StatusRow): string | null => {
    const v = r.fieldValues[fd.key];
    return v == null || v === '' ? null : String(v);
  };
  return {
    key: `field:${fd.key}`,
    label: fd.label,
    weight: 12,
    value: read,
    render: (r) => (fd.type === 'date' ? formatDate(read(r)) : (read(r) ?? '—')),
  };
}

/* 바깥 틀에 `min-h-0` 을 걸지 않는다 — 걸면 flex 가 표를 컨테이너 높이까지 **줄여** 버리는데,
   `TableCard` 가 넘치는 부분을 잘라 내므로 스크롤바도 없이 행이 사라진다(21건 중 17행만
   보였다). 스크롤은 바깥(`overflow-auto`)이 맡으므로 여기서 줄어들 이유가 없다. */
export function StatusTable({
  rows, fieldColumns, selectedId, onSelectAsset, nodeScope = false,
}: StatusTableProps) {
  const [sortKey, setSortKey] = useState<string>('name');
  const [asc, setAsc] = useState(true);
  const [query, setQuery] = useState('');
  /** 펼쳐 둔 설비 묶음 — 기본은 접힘(세는 단위가 설비 하나이므로). */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  /* 구조 열 → 선언된 필드 열 → 이력·상태. 필드 열은 카탈로그가 정하므로 개수가 화면마다 다르다. */
  const cols = useMemo<Column[]>(
    () => [
      ...(nodeScope ? [SUBSTATION_COL] : []),
      ...STRUCTURAL_COLS,
      ...fieldColumns.map(fieldColumn),
      ...TRAILING_COLS,
    ],
    [fieldColumns, nodeScope],
  );

  /* 검색이 없으면 자산이 수백 개가 됐을 때 찾을 방법이 정렬뿐이다.
     **표에 실제로 있는 열**을 통째로 훑는다 — 어느 열인지 고르게 하지 않는 이유는, 사용자는
     보통 "그 이름" 하나만 기억하지 그것이 몇 번째 열인지는 모르기 때문. 훑을 열을 따로 적어
     두면 열이 늘 때마다 같이 고쳐야 하고, 안 고치면 보이는데 안 찾히는 열이 생긴다. */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => cols.some((c) => (c.value(r) ?? '').toLowerCase().includes(q)));
  }, [rows, query, cols]);

  function handleHeaderClick(key: string) {
    if (sortKey === key) {
      setAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setAsc(true);
    }
  }

  const sortCol = cols.find((c) => c.key === sortKey) ?? cols[0];
  const sorted = [...filtered].sort((a, b) => {
    if (!sortCol) return 0;
    const cmp = compareValues(sortCol.value(a), sortCol.value(b));
    return asc ? cmp : -cmp;
  });

  /**
   * 설비 묶음은 **뿌리 뒤에 붙여 둔다** — 정렬은 뿌리끼리만 겨룬다.
   *
   * 정렬을 행 전체에 그대로 걸면 펼쳤을 때 안쪽 자산이 이름순 자리로 흩어져, 어느 설비에
   * 든 것인지 알 수 없게 된다(실제로 그랬다). 안쪽은 **위치 경로**로 늘어놓는다 — 경로가
   * 곧 트리 순서라 부모가 자식보다 앞선다.
   */
  const ordered = useMemo(() => {
    const kids = new Map<string, StatusRow[]>();
    for (const r of sorted) {
      if (r.assemblyRootId === null || r.id === r.assemblyRootId) continue;
      const list = kids.get(r.assemblyRootId) ?? [];
      list.push(r);
      kids.set(r.assemblyRootId, list);
    }
    // 한 설비 안의 부품 차례는 자리순 — 판을 위에서 아래로 읽는 순서와 같다.
    for (const list of kids.values()) list.sort((a, b) => a.location.localeCompare(b.location, 'ko'));

    const out: StatusRow[] = [];
    for (const r of sorted) {
      if (r.assemblyRootId !== null && r.id !== r.assemblyRootId) continue;
      out.push(r);
      if (r.assemblyRootId === r.id) out.push(...(kids.get(r.id) ?? []));
    }
    return out;
  }, [sorted]);

  /**
   * 설비 종류으로 놓은 묶음은 **한 줄로 접는다** — 업무에서 세는 단위가 그 설비 하나다.
   *
   * 접는 것이지 숨기는 것이 아니다. 점검·고장이력은 여전히 개별 자산에 붙으므로 들어갈
   * 길이 사라지면 안 된다. 그리고 검색 중에는 접지 않는다 — 찾은 것이 안쪽에 있으면
   * 접힌 채로는 "없다" 로 읽힌다.
   */
  const searching = query.trim().length > 0;
  const visible = ordered.filter(
    (r) => searching || r.assemblyRootId === null || r.id === r.assemblyRootId || expanded.has(r.assemblyRootId),
  );
  /** 이 뿌리가 접을 자손을 실제로 갖고 있는가 — 없으면 화살표를 달지 않는다. */
  const hasChildren = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.assemblyRootId !== null && r.id !== r.assemblyRootId) set.add(r.assemblyRootId);
    return set;
  }, [rows]);

  // 가중치를 100 으로 정규화 — 필드 열 개수를 미리 알 수 없어 절대 비율을 못 쓴다.
  const totalWeight = cols.reduce((n, c) => n + c.weight, 0) || 1;
  const widths = cols.map((c) => (c.weight / totalWeight) * 100);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex max-w-6xl items-center gap-2">
        <TableSearch
          aria-label="자산 검색"
          placeholder="표에 보이는 값으로 검색"
          value={query}
          onChange={setQuery}
          shown={visible.length}
          total={rows.length}
        />
      </div>

    <TableCard widths={widths}>
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
        {visible.map((row) => {
            const isRoot = row.assemblyRootId !== null && row.id === row.assemblyRootId;
            const canExpand = isRoot && hasChildren.has(row.id);
            return (
              <tr
                key={row.id}
                className={cn('border-b border-line last:border-0', SELECTABLE, row.id === selectedId && SELECTED)}
                onClick={() => onSelectAsset(row.id)}
              >
                {cols.map((col, i) => (
                  <td key={col.key} className="truncate px-3 py-2 text-content">
                    {/* 접기 화살표는 첫 열에만 — 들여쓰기도 여기서 준다(안쪽임을 한눈에). */}
                    {i === 0 ? (
                      <span className="flex items-center gap-1" style={{ paddingLeft: row.depth * 14 }}>
                        {canExpand ? (
                          <button
                            type="button"
                            aria-label={`${row.name} ${expanded.has(row.id) ? '접기' : '펼치기'}`}
                            className="shrink-0 text-content-faint hover:text-content"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpanded((prev) => {
                                const next = new Set(prev);
                                if (next.has(row.id)) next.delete(row.id);
                                else next.add(row.id);
                                return next;
                              });
                            }}
                          >
                            {expanded.has(row.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        ) : (
                          row.depth > 0 && <span className="w-3.5 shrink-0" aria-hidden />
                        )}
                        <span className="min-w-0 truncate">{col.render(row)}</span>
                      </span>
                    ) : (
                      col.render(row)
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
      </tbody>
    </TableCard>
    </div>
  );
}
