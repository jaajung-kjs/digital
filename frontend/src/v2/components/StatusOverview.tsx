import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
/* 상태의 **색도 어휘가 정한다**(`assetStatusTone`) — 화면이 제 표를 또 만들면 같은 상태가
   화면마다 다른 색으로 뜬다. 실제로 이 파일이 core 의 것과 같은 함수를 다시 갖고 있었다. */
import { ASSET_STATUSES, assetStatusLabel, assetStatusTone } from '@twin/core';
import {
  EMPTY,
  EmptyState,
  IconButton,
  StatusDot,
  TABLE_ROW,
  TableCard,
  TableSearch,
  Th,
  cn,
  formatDate,
  selectableRow,
  SelectionScope,
  useScrollSelectedIntoView,
  SELECTABLE,
  SELECTED, Td, DetailCard } from '../../components/ui';

import type { StatusRow, StatusRowsResult } from '../statusRows';
import { summarize } from '../statusSummary';

type FieldDef = StatusRowsResult['fieldColumns'][number];

/** 상태 어휘가 선언한 톤을 화면 톤으로 옮긴다 — 모르는 톤은 조용한 쪽으로 둔다. */



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
  /**
   * 「그 변전소에서 열기」 — 본부·지사에서만 준다.
   *
   * 누르는 것만으로 화면을 옮기지 않는다: 표를 훑다가 한 줄을 짚어 보는 일이 훨씬 잦은데
   * 그때마다 다른 변전소로 끌려가면 보던 자리를 잃는다. 옮기는 것은 **또렷한 한 번**이다.
   */
  onOpenElsewhere?: (id: string) => void;
  actions?: ReactNode;
}

/** 걸러 보는 눈금 — 무엇으로 좁혀 보고 있는지는 이 셋뿐이다. */
interface Filter {
  kind: '전부' | '설비' | '장비';
  status: string | null;
  neverInspected: boolean;
}
/**
 * 처음 열면 **설비만** 보인다.
 *
 * 현황에서 먼저 묻는 것은 「이 변전소에 무엇이 놓여 있나」이고, 도면에 놓이는 것은 설비다.
 * 장비까지 함께 펼치면 첫 화면이 그 안의 부품 수십 줄로 덮인다. 장비는 칩 한 번으로 온다.
 */
const DEFAULT_FILTER: Filter = { kind: '설비', status: null, neverInspected: false };

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
export function StatusOverview({ rows, fieldColumns, selectedId, onSelectAsset, nodeScope, onOpenElsewhere, actions }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>(DEFAULT_FILTER);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  /** 접어 둔 분류 — 「통신은 접고 구조만 보기」. 기본은 전부 펼친 상태다. */
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const toggle = (set: ReadonlySet<string>, key: string): ReadonlySet<string> => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

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
  const allCollapsed = summary.groups.length > 0 && summary.groups.every((g) => collapsed.has(g.categoryName));
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

  /* 상세 패널에서 고른 것이 이 표에도 있으면 화면 안으로 옮긴다 — 색만 바뀌면 스무 줄
     아래의 그 줄이 칠해졌다는 것조차 안 보인다. */
  const scrollRef = useScrollSelectedIntoView<HTMLDivElement>(selectedId);

  return (
    /* 판을 담는 카드 — 다른 세 탭과 같은 자리·같은 테두리. */
    <DetailCard board className="flex min-h-0 min-w-0 flex-1 flex-col">
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

      <SelectionScope onClear={() => onSelectAsset(null)} className="flex min-h-0 flex-1 flex-col" ref={scrollRef}>
        <TableCard fill widths={widths}>
          <thead>
            <tr className="sticky top-0 z-sticky">
              <Th>
                {/* **모두 접기/펴기는 그 계층을 쥔 열의 머리글에** — 엑셀의 윤곽 단추, AG Grid 의
                    그룹 열 머리글이 같은 자리다. 다 접으면 그것이 곧 분류별 요약표가 된다. */}
                <span className="flex items-center gap-2">
                  항목
                  {summary.groups.length > 0 && (
                    <button
                      type="button"
                      className="rounded px-1 font-normal text-content-faint hover:bg-surface-3 hover:text-content"
                      onClick={() => {
                        if (allCollapsed) return setCollapsed(new Set());
                        /* 접을 때는 품목까지 함께 — 반쯤 펼쳐진 채로 남으면 「모두」가 거짓말이 된다. */
                        setExpanded(new Set());
                        setCollapsed(new Set(summary.groups.map((g) => g.categoryName)));
                      }}
                    >
                      {allCollapsed ? '모두 펴기' : '모두 접기'}
                    </button>
                  )}
                </span>
              </Th>
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
                <Td colSpan={colCount}>
                  {query.trim() || filter !== DEFAULT_FILTER ? (
                    <EmptyState title="조건과 맞는 설비가 없습니다" />
                  ) : (
                    <EmptyState title="설비가 없습니다" description="평면도에서 「배치」 로 놓으세요." />
                  )}
                </Td>
              </tr>
            )}

            {summary.groups.map((group) => (
              <Fragment key={group.categoryName}>
                {/**
                 * 분류 줄 — **본문의 한 줄**이지 머리글이 아니다.
                 *
                 * 계층은 들여쓰기 · 셰브런 · 굵기로 말한다(자료표의 통용 방식 — AG Grid 의
                 * 그룹 줄, 엑셀의 윤곽). 배경을 채워 구분하려 들면 머리글과 같은 옷이 되어
                 * 「어디까지가 머리글인가」가 흐려진다 — 색은 마지막 수단이다.
                 */}
                <tr
                  /* 높이는 표가 정한다(`TABLE_ROW`) — 층은 들여쓰기·굵기·셰브런이 말한다.
                     묶음 줄만 경계선이 위에 붙는다(§표 계층). */
                  className={cn(TABLE_ROW, 'border-b-0 border-t', SELECTABLE)}
                  onClick={() => setCollapsed((prev) => toggle(prev, group.categoryName))}
                >
                  <Td className="text-content">
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`${group.categoryName} ${collapsed.has(group.categoryName) ? '펼치기' : '접기'}`}
                        aria-expanded={!collapsed.has(group.categoryName)}
                        className="shrink-0 text-content-faint hover:text-content"
                      >
                        {collapsed.has(group.categoryName) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      </button>
                      <span className="truncate font-semibold">{group.categoryName}</span>
                    </span>
                  </Td>
                  <Td align="right" className="font-semibold text-content">{group.count}</Td>
                  <Td colSpan={colCount - 2} />
                </tr>

                {!collapsed.has(group.categoryName) &&
                  group.items.map((item) => {
                  const open = expanded.has(item.key);
                  const bad = Object.entries(item.byStatus).filter(([v]) => v !== OK_STATUS);
                  return (
                    <Fragment key={item.key}>
                      <tr
                        className={cn(TABLE_ROW, SELECTABLE)}
                        onClick={() =>
                          setExpanded((prev) => {
                            const next = new Set(prev);
                            if (next.has(item.key)) next.delete(item.key);
                            else next.add(item.key);
                            return next;
                          })
                        }
                      >
                        <Td className="truncate pl-8 text-content">
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
                        </Td>
                        <Td align="right" className="text-content">{item.count}</Td>
                        <Td>
                          {bad.length === 0 ? (
                            <span className="text-xs text-content-faint">{EMPTY}</span>
                          ) : (
                            <span className="flex flex-wrap items-center gap-1">
                              {bad.map(([value, n]) => (
                                <StatusDot key={value} status={assetStatusTone(value) ?? 'neutral'}>
                                  {assetStatusLabel(value)} {n}
                                </StatusDot>
                              ))}
                            </span>
                          )}
                        </Td>
                        {/* 접힌 줄은 **얼마나 · 성한가**만 말한다 — 자리는 펼치면 순서대로 나온다.
                            비어 있어도 **칸은 낸다**: 셀이 없으면 그 자리는 줄에 속하지 않아
                            손이 닿아도 칠해지지 않는다(호버가 설치일 앞에서 끊겼다). */}
                        <Td />
                        {fieldColumns.map((fd) => (
                          <Td key={fd.key} />
                        ))}
                        <Td />
                      </tr>

                      {open &&
                        item.rows.map((r) => (
                          <tr
                            key={r.id}
                            {...selectableRow(selectedId, r.id, onSelectAsset)}
                            className={cn(
                              TABLE_ROW,
                              'group',
                              SELECTABLE,
                              r.id === selectedId && SELECTED,
                            )}
                          >
                            {/* 펼친 줄은 **그 품목이 실제로 어떤 것들인지**다 — 저장된 이름·상태·자리.
                                열의 뜻은 그대로다(개수 칸은 비운다 — 하나짜리에 「1」은 군더더기다). */}
                            <Td className="pl-14 text-content">
                              <span className="flex items-center gap-1">
                                <span className="min-w-0 truncate">{r.name}</span>
                                {onOpenElsewhere && (
                                  /* 손이 닿을 때 드러난다 — 트리의 줄 손잡이와 같은 어법. */
                                  <IconButton
                                    size="sm"
                                    aria-label={`${r.name} 이 있는 변전소에서 열기`}
                                    className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onOpenElsewhere(r.id);
                                    }}
                                  >
                                    <ExternalLink size={12} />
                                  </IconButton>
                                )}
                              </span>
                            </Td>
                            <Td />
                            <Td>
                              <StatusDot status={assetStatusTone(r.status) ?? 'neutral'}>{assetStatusLabel(r.status)}</StatusDot>
                            </Td>
                            <Td className="truncate text-content-muted">{whereOf(r)}</Td>
                            {fieldColumns.map((fd) => {
                              const v = r.fieldValues[fd.key];
                              const text = v == null || v === '' ? EMPTY : fd.type === 'date' ? formatDate(String(v)) : String(v);
                              return (
                                <Td align="right" key={fd.key} className={cn( 'truncate text-content-muted', fd.type === 'number' && '', )}>
                                  {text}
                                </Td>
                              );
                            })}
                            <Td className="text-content-muted">
                              {formatDate(r.lastInspectedAt) || EMPTY}
                            </Td>
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
    </DetailCard>
  );
}
