import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { ASSET_STATUSES, assetStatusLabel } from '@twin/core';
import {
  EMPTY,
  EmptyState,
  StatusDot,
  TableCard,
  TableSearch,
  Th,
  cn,
  formatDate,
  selectableRow,
  SelectionScope,
  SELECTABLE,
  SELECTED,
} from '../../components/ui';
import type { BadgeStatus } from '../../components/ui';
import type { StatusRow, StatusRowsResult } from '../statusRows';
import { summarize } from '../statusSummary';

type FieldDef = StatusRowsResult['fieldColumns'][number];

/** 상태 어휘가 선언한 톤을 화면 톤으로 옮긴다 — 모르는 톤은 조용한 쪽으로 둔다. */
const KNOWN_TONES: ReadonlySet<string> = new Set<BadgeStatus>(['success', 'warning', 'danger', 'info', 'neutral']);

function assetStatusTone(value: string): BadgeStatus {
  const tone = ASSET_STATUSES.find((s) => s.value === value)?.tone;
  return tone != null && KNOWN_TONES.has(tone) ? (tone as BadgeStatus) : 'neutral';
}

/** 좋은 상태 하나 — 나머지(고장·예비…)만 칩으로 세운다. 「정상 47」은 볼 일이 없다. */
const OK_STATUS = ASSET_STATUSES.find((s) => s.tone === 'success')?.value ?? 'normal';

interface Props {
  rows: StatusRow[];
  /** 개체 줄에 이어 붙일 선언 필드 — 집계 줄에는 세우지 않는다(집계되는 값이 아니다). */
  fieldColumns: FieldDef[];
  selectedId: string | null;
  onSelectAsset: (id: string | null) => void;
  /** 본부·지사를 고른 상태인가 — 「어디에」가 변전소를 가리킨다(변전소면 층). */
  nodeScope?: boolean;
  actions?: ReactNode;
}

/** 걸러 보는 눈금 — 무엇으로 좁혀 보고 있는지는 이 셋뿐이다. */
interface Filter {
  kind: '전부' | '설비' | '장비';
  status: string | null;
  neverInspected: boolean;
}
const NO_FILTER: Filter = { kind: '전부', status: null, neverInspected: false };

/**
 * 설비 현황 — **집계가 본문이고 목록은 그 안에 접혀 있다**.
 *
 * 묻는 말이 「강원본부에 L3 스위치가 몇 개지」·「광전송장치는 어디에 있지」인데, 예전 표는
 * 자산을 한 줄씩 늘어놓기만 했다 — 세는 일은 사람이 눈으로 했고, 변전소를 옮겨 가며 더해야
 * 했다. 이제 **분류 ▸ 품목**으로 접어 개수를 먼저 보이고, 그 줄을 펼치면 어디에 있는지
 * 나온다. 고른 곳이 본부·지사면 변전소별로, 변전소면 층별로 — **같은 화면이 범위만 바꾼다**.
 *
 * 세는 것은 사실뿐이다(개수·상태·점검 이력 없음). 「몇 달 지난 점검」 같은 기준은 두지
 * 않는다 — 몇 달이 맞는지 이 코드는 알 수 없고, 그런 기준은 화면마다 다른 숫자를 만든다.
 */
export function StatusOverview({ rows, fieldColumns, selectedId, onSelectAsset, nodeScope, actions }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>(NO_FILTER);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  /** 검색과 필터는 **개체에 걸린다** — 그러고 나서 남은 것을 센다(집계가 늘 진실이 되게). */
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter.kind !== '전부' && r.kind !== filter.kind) return false;
      if (filter.status && r.status !== filter.status) return false;
      if (filter.neverInspected && r.lastInspectedAt != null) return false;
      if (!q) return true;
      return [r.name, r.typeName, r.categoryName, r.where, r.location].some((v) =>
        (v ?? '').toLowerCase().includes(q),
      );
    });
  }, [rows, query, filter]);

  /* 폭은 가중치로 — 선언 필드 수를 미리 알 수 없어 절대 비율을 못 쓴다(옛 표와 같은 규칙). */
  const widths = useMemo(() => {
    const weights = [30, 7, 12, 24, ...fieldColumns.map(() => 12), 13];
    const total = weights.reduce((n, w) => n + w, 0) || 1;
    return weights.map((w) => (w / total) * 100);
  }, [fieldColumns]);
  const colCount = 5 + fieldColumns.length;

  /**
   * 이 개체가 있는 자리 한 마디.
   *
   * 본부·지사에서는 변전소가 먼저다(「서홍천S/S · OFD」), 변전소 안에서는 층부터의 경로가
   * 이미 그것을 말한다(「1층 · OFD · 1행 1열」).
   */
  const whereOf = (r: StatusRow) =>
    nodeScope ? [r.where, r.location].filter((v) => v && v !== EMPTY).join(' · ') : r.location || r.where || EMPTY;

  const summary = useMemo(() => summarize(shown), [shown]);
  /** 칩의 숫자는 **거르기 전 전체**다 — 걸러 놓고 그 숫자를 다시 세면 칩이 늘 0 이 된다. */
  const all = useMemo(() => summarize(rows), [rows]);

  const chip = (label: string, count: number, on: boolean, tone: 'default' | 'danger' | 'warning', onClick: () => void) => (
    <button
      key={label}
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs transition-colors',
        on ? 'border-primary bg-info-bg text-primary' : 'border-line text-content-muted hover:bg-surface-2',
        !on && tone === 'danger' && count > 0 && 'text-danger',
        !on && tone === 'warning' && count > 0 && 'text-warning',
      )}
    >
      {label} <span className="tabular-nums font-medium">{count}</span>
    </button>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <div className="flex max-w-6xl shrink-0 items-center gap-2">
        <TableSearch
          aria-label="현황 검색"
          placeholder="분류·품목·이름·위치로 검색"
          value={query}
          onChange={setQuery}
          shown={shown.length}
          total={rows.length}
        />
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>

      {/* 요약 — **한눈에**는 여기서 끝나야 한다: 얼마나 있고, 손볼 것이 있는가. */}
      <div className="flex max-w-6xl shrink-0 flex-wrap items-center gap-1.5">
        {chip('설비', all.assemblies, filter.kind === '설비', 'default', () =>
          setFilter((f) => ({ ...f, kind: f.kind === '설비' ? '전부' : '설비' })),
        )}
        {chip('장비', all.devices, filter.kind === '장비', 'default', () =>
          setFilter((f) => ({ ...f, kind: f.kind === '장비' ? '전부' : '장비' })),
        )}
        <span className="mx-1 h-4 w-px bg-line" aria-hidden />
        {ASSET_STATUSES.filter((s) => s.value !== OK_STATUS).map((s) =>
          chip(assetStatusLabel(s.value), all.byStatus[s.value] ?? 0, filter.status === s.value, 'danger', () =>
            setFilter((f) => ({ ...f, status: f.status === s.value ? null : s.value })),
          ),
        )}
        {chip('미점검', all.neverInspected, filter.neverInspected, 'warning', () =>
          setFilter((f) => ({ ...f, neverInspected: !f.neverInspected })),
        )}
      </div>

      <SelectionScope onClear={() => onSelectAsset(null)} className="flex min-h-0 flex-1 flex-col">
        <TableCard fill widths={widths}>
          <thead>
            <tr className="sticky top-0 z-sticky">
              <Th>분류 · 품목</Th>
              <Th align="right">개수</Th>
              <Th>상태</Th>
              {/* 집계 줄은 **어디에 몇 개**, 개체 줄은 **그것이 있는 자리**. 한 열의 두 겹이다. */}
              <Th>위치</Th>
              {fieldColumns.map((fd) => (
                <Th key={fd.key} align={fd.type === 'number' ? 'right' : 'left'}>
                  {fd.label}
                </Th>
              ))}
              <Th>마지막점검일</Th>
            </tr>
          </thead>
          <tbody>
            {summary.groups.length === 0 && (
              <tr>
                <td colSpan={colCount}>
                  {query.trim() || filter !== NO_FILTER ? (
                    <EmptyState title="조건과 맞는 설비가 없습니다" />
                  ) : (
                    <EmptyState title="설비가 없습니다" description="평면도에서 「배치」 로 놓으세요." />
                  )}
                </td>
              </tr>
            )}

            {summary.groups.map((group) => (
              <Fragment key={group.categoryName}>
                {/* 분류 줄 — 「통신 21」. 무엇이 많은지가 현황에서 먼저 궁금하다. */}
                <tr className="border-b border-line bg-surface-2">
                  <td className="px-3 py-1.5 text-xs font-semibold text-content">{group.categoryName}</td>
                  <td className="px-3 py-1.5 text-right text-xs font-semibold tabular-nums text-content">
                    {group.count}
                  </td>
                  <td colSpan={colCount - 2} />
                </tr>

                {group.items.map((item) => {
                  const open = expanded.has(item.key);
                  const bad = Object.entries(item.byStatus).filter(([v]) => v !== OK_STATUS);
                  return (
                    <Fragment key={item.key}>
                      <tr
                        className={cn('border-b border-line', SELECTABLE)}
                        onClick={() =>
                          setExpanded((prev) => {
                            const next = new Set(prev);
                            if (next.has(item.key)) next.delete(item.key);
                            else next.add(item.key);
                            return next;
                          })
                        }
                      >
                        <td className="truncate px-3 py-2 text-content">
                          <span className="flex items-center gap-1">
                            <button
                              type="button"
                              aria-label={`${item.itemName} ${open ? '접기' : '펼치기'}`}
                              className="shrink-0 text-content-faint hover:text-content"
                            >
                              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                            <span className="min-w-0 truncate">{item.itemName}</span>
                            <span className="shrink-0 rounded border border-line px-1 text-xs text-content-faint">
                              {item.kind}
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-content">{item.count}</td>
                        <td className="px-3 py-2">
                          {bad.length === 0 ? (
                            <span className="text-xs text-content-faint">{EMPTY}</span>
                          ) : (
                            <span className="flex flex-wrap items-center gap-1">
                              {bad.map(([value, n]) => (
                                <StatusDot key={value} status={assetStatusTone(value)}>
                                  {assetStatusLabel(value)} {n}
                                </StatusDot>
                              ))}
                            </span>
                          )}
                        </td>
                        <td className="truncate px-3 py-2 text-xs text-content-muted">
                          {item.where.map((w) => `${w.label} ${w.count}`).join(' · ')}
                        </td>
                      </tr>

                      {open &&
                        item.rows.map((r) => (
                          <tr
                            key={r.id}
                            {...selectableRow(selectedId, r.id, onSelectAsset)}
                            className={cn(
                              'border-b border-line focus-visible:outline-none focus-ring-input',
                              SELECTABLE,
                              r.id === selectedId && SELECTED,
                            )}
                          >
                            {/* 펼친 줄은 **그 품목이 실제로 어떤 것들인지**다 — 저장된 이름·상태·자리.
                                열의 뜻은 그대로다(개수 칸은 비운다 — 하나짜리에 「1」은 군더더기다). */}
                            <td className="truncate px-3 py-1.5 pl-10 text-content">{r.name}</td>
                            <td />
                            <td className="px-3 py-1.5">
                              <StatusDot status={assetStatusTone(r.status)}>{assetStatusLabel(r.status)}</StatusDot>
                            </td>
                            <td className="truncate px-3 py-1.5 text-content-muted">{whereOf(r)}</td>
                            {fieldColumns.map((fd) => {
                              const v = r.fieldValues[fd.key];
                              const text = v == null || v === '' ? EMPTY : fd.type === 'date' ? formatDate(String(v)) : String(v);
                              return (
                                <td
                                  key={fd.key}
                                  className={cn(
                                    'truncate px-3 py-1.5 text-content-muted',
                                    fd.type === 'number' && 'text-right tabular-nums',
                                  )}
                                >
                                  {text}
                                </td>
                              );
                            })}
                            <td className="px-3 py-1.5 text-content-muted">
                              {formatDate(r.lastInspectedAt) || EMPTY}
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </TableCard>
      </SelectionScope>
    </div>
  );
}
