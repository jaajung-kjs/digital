import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { EQUIPMENT_STATUSES, compareName } from '@twin/core';
import {
  Button, EMPTY, EmptyState, HOVER_REVEAL, IconButton, SegmentedControl, Select, SELECTABLE, SELECTED, StatusDot,
  TABLE_ROW, TableCard, TableSearch, Td, Th, ViewCard, cn, formatDate, selectableRow, useScrollSelectedIntoView, useTableLayout,
  type TableColumn,
} from '../../../components/ui';
import { summarize } from '../../statusSummary';
import type { StatusRow } from './statusRows';

type Tone = 'success' | 'warning' | 'danger' | 'neutral';
const STATUS = new Map<string, { label: string; tone: Tone }>(
  EQUIPMENT_STATUSES.map((s) => [s.value, { label: s.label, tone: s.tone }]),
);
const statusLabel = (v: string) => STATUS.get(v)?.label ?? v;
const statusTone = (v: string): Tone => STATUS.get(v)?.tone ?? 'neutral';

/** 좋은 상태 하나 — 나머지(예비·고장…)만 칩으로 세운다. */
const OK_STATUS = EQUIPMENT_STATUSES.find((s) => s.tone === 'success')?.value ?? 'normal';

export interface StatusRackInfo { id: string; name: string; typeName: string }

export interface StatusViewProps {
  rows: StatusRow[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** 본부·지사를 고른 상태 — 읽기 전용, 랙이 아니라 변전소가 먼저다. */
  nodeScope?: boolean;
  /** 「국에서 열기」 — 본부·지사에서만 준다. */
  onOpenElsewhere?: (row: StatusRow) => void;
  racks?: StatusRackInfo[];
  selectedRackId?: string | null;
  onSelectRack?: (id: string | null) => void;
  onAddRack?: () => void;
  onAddEquipment?: (rackId?: string) => void;
}

type Mode = '품목별' | '랙별';
const MODES = [{ key: '품목별' as const, label: '품목별' }, { key: '랙별' as const, label: '랙별' }];
/** 상태 거르개 — 하나만 고른다. '' = 전체, 상태 값, 또는 미점검. */
const NEVER = '__never__';

/**
 * 열 — 이름·개수·랙(품목)은 늘 있고, 상태(정상 아닌 것)·모델·제조사·설치일·마지막점검일은 값이 있을 때만 그린다.
 * 판이 좁으면(§1.7-e, 700px 아래) 모델·제조사·설치일이 숨는다(최근 점검은 남는다) — 그 값은 상세 레일에 있다.
 */
const COLUMNS = [
  { key: 'name', width: 26 }, { key: 'count', width: 7 }, { key: 'status', width: 14 }, { key: 'where', width: 17 },
  { key: 'model', width: 10, priority: 3 }, { key: 'maker', width: 10, priority: 3 }, { key: 'install', width: 9, priority: 3 }, { key: 'inspected', width: 10 },
] as const satisfies readonly TableColumn[];
const KEYS = COLUMNS.map((c) => c.key);

/** `after` 열 뒤로 지금 서는 열을 한 칸으로 덮는다 — 없으면 그리지 않는다. */
function RestCells({ after }: { after: string }) {
  const { shows } = useTableLayout();
  const n = KEYS.slice(KEYS.indexOf(after as (typeof KEYS)[number]) + 1).filter(shows).length;
  return n > 0 ? <Td colSpan={n} /> : null;
}
/** 표 폭 전체를 덮는 한 칸(빈 상태). */
function FullRow({ children }: { children: ReactNode }) {
  const { colCount } = useTableLayout();
  return <tr><Td colSpan={colCount}>{children}</Td></tr>;
}
const OPTIONAL: Readonly<Record<string, (r: StatusRow) => boolean>> = {
  /* 정상은 칸을 비운다 — 모두 정상이면 그 열은 통째로 빈 열이다. */
  status: (r) => r.status !== OK_STATUS,
  model: (r) => !!r.model,
  maker: (r) => !!r.maker,
  /* 날짜 자체를 본다 — `formatDate` 는 빈 값에도 「—」를 돌려주므로 그것으로 재면 늘 「있다」가 된다. */
  install: (r) => !!r.installDate,
  inspected: (r) => !!r.lastInspectedAt,
};
const noop = () => {};
const NO_RACK = '__no_rack__';

/**
 * 현황 — 설비를 **품목별**(분야 ▸ 품목 ▸ 설비) 또는 **랙별**(랙 ▸ 설비)로 읽는다.
 * 세는 것은 사실뿐이다: 개수·상태·점검 이력 없음. 랙은 세지 않는다.
 */
export function StatusView({
  rows, selectedId, onSelect, nodeScope, onOpenElsewhere, racks, selectedRackId = null, onSelectRack, onAddRack, onAddEquipment,
}: StatusViewProps) {
  const [mode, setMode] = useState<Mode>('품목별');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const canRackView = !nodeScope && racks != null;
  const view: Mode = canRackView ? mode : '품목별';
  const toggle = (set: ReadonlySet<string>, key: string): ReadonlySet<string> => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  const filtering = query.trim() !== '' || filter !== '';
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === NEVER) { if (r.lastInspectedAt != null) return false; }
      else if (filter && r.status !== filter) return false;
      if (!q) return true;
      return [r.name, r.typeName, r.categoryName, r.rackName, r.substationName, r.model, r.maker].some((v) => (v ?? '').toLowerCase().includes(q));
    });
  }, [rows, query, filter]);
  const summary = useMemo(() => summarize(shown), [shown]);
  /** 칩의 숫자는 거르기 전 전체다. */
  const all = useMemo(() => summarize(rows), [rows]);
  /** 보이는 행에 값이 하나라도 있는 열만 그린다 — 열 정의는 그대로, 표시만 거른다. 폭 순위는 `TableCard` 가 본다. */
  const columns = useMemo<readonly TableColumn[]>(
    () => COLUMNS.map((c) => ({ ...c, hidden: OPTIONAL[c.key] ? !shown.some(OPTIONAL[c.key]!) : false })),
    [shown],
  );
  /** 랙마다 설비가 몇 개인가 — 거르기 전 전체(일체형 판정은 거른 결과에 흔들리지 않는다). */
  const perRack = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.rackId, (m.get(r.rackId) ?? 0) + 1);
    return m;
  }, [rows]);
  const statusChoices = EQUIPMENT_STATUSES.filter((s) => s.value !== OK_STATUS).map((s) => [s.value, s.label, all.byStatus[s.value] ?? 0] as const);
  const allCollapsed = summary.groups.length > 0 && summary.groups.every((g) => collapsed.has(g.categoryName));
  const scrollRef = useScrollSelectedIntoView<HTMLDivElement>(selectedId);

  const rackGroups = useMemo(() => {
    if (!racks) return [];
    const byRack = new Map<string, StatusRow[]>();
    for (const r of shown) byRack.set(r.rackId, [...(byRack.get(r.rackId) ?? []), r]);
    const known = new Set(racks.map((r) => r.id));
    const orphans = shown.filter((r) => !known.has(r.rackId));
    const groups = racks
      .map((rack) => ({ rack, rows: (byRack.get(rack.id) ?? []).sort((a, b) => compareName(a.name, b.name)) }))
      .filter((g) => !filtering || g.rows.length > 0)
      .sort((a, b) => compareName(a.rack.name, b.rack.name));
    if (orphans.length > 0) groups.push({ rack: { id: NO_RACK, name: '랙 없음', typeName: '' }, rows: orphans });
    return groups;
  }, [racks, shown, filtering]);

  const rackCell = (r: StatusRow) => (nodeScope ? [r.substationName, r.rackName].filter(Boolean).join(' · ') : r.rackName);
  /** 품목 줄의 랙 칸 — 접힌 채로도 「어디에」가 읽히게: 한 랙에 다 있으면 그 랙, 아니면 「랙 n개」. */
  const rackSummary = (items: readonly StatusRow[]) => {
    const where = new Set(items.map((r) => `${r.substationId}:${r.rackId}`));
    return where.size === 1 && items[0] ? rackCell(items[0]) : `랙 ${where.size}개`;
  };

  /** 설비 한 줄 — `count` 를 주면 개수 칸에 선다(일체형 랙 한 줄은 랙 행이기도 하므로 1). */
  const equipmentRow = (r: StatusRow, indent: string, fourth: string, key: string = r.id, count?: number) => (
    <tr
      key={key}
      {...selectableRow(selectedId, r.id, onSelect)}
      className={cn(TABLE_ROW, 'group', SELECTABLE, r.id === selectedId && SELECTED)}
    >
      <Td className={cn(indent, 'text-content')}>
        <span className="flex items-center gap-1">
          <span className="min-w-0 truncate">{r.name}</span>
          {onOpenElsewhere && (
            <IconButton
              size="sm"
              aria-label={`${r.name} 소속 변전소에서 열기`}
              className={cn('shrink-0', HOVER_REVEAL)}
              onClick={(e) => { e.stopPropagation(); onOpenElsewhere(r); }}
            >
              <ExternalLink size={12} />
            </IconButton>
          )}
        </span>
      </Td>
      <Td align="right" className="text-content">{count}</Td>
      <Td col="status">{r.status !== OK_STATUS && <StatusDot status={statusTone(r.status)}>{statusLabel(r.status)}</StatusDot>}</Td>
      <Td className="truncate text-content-muted">{fourth}</Td>
      <Td col="model" className="truncate text-content-muted">{r.model ?? EMPTY}</Td>
      <Td col="maker" className="truncate text-content-muted">{r.maker ?? EMPTY}</Td>
      <Td col="install" className="text-content-muted">{formatDate(r.installDate) || EMPTY}</Td>
      <Td col="inspected" className="text-content-muted">{formatDate(r.lastInspectedAt) || EMPTY}</Td>
    </tr>
  );

  const empty = (
    <FullRow>
      {filtering ? <EmptyState title={query.trim() ? `'${query.trim()}'에 해당하는 설비가 없습니다` : '조건에 해당하는 설비가 없습니다'} /> : <EmptyState title="설비가 없습니다" description={!nodeScope && onAddEquipment ? '「설비 추가」로 등록하세요.' : undefined} />}
    </FullRow>
  );

  return (
    <ViewCard
      onClearSelection={() => onSelect(null)}
      bodyRef={scrollRef}
      tools={
        /* 범위 고르개·펼치기는 줄지 않는다 — 좁아지면 오른쪽 검색 칸이 먼저 준다(§3.1). */
        <div className="flex shrink-0 items-center gap-2">
          {canRackView && <SegmentedControl aria-label="현황 보기" items={MODES} value={mode} onChange={setMode} />}
          <div className="w-36 shrink-0">
            <Select size="sm" aria-label="상태" value={filter} onChange={(e) => setFilter(e.currentTarget.value)}>
              <option value="">상태 전체</option>
              {statusChoices.map(([value, label, n]) => (
                <option key={value} value={value}>상태: {label} {n}</option>
              ))}
              <option value={NEVER}>상태: 미점검 {all.neverInspected}</option>
            </Select>
          </div>
          {/* 모두 펼치기/접기 — 머리 띠 왼쪽 묶음 끝의 글자 단추(전원 계통도와 같은 꼴·자리, §3.10). */}
          {view === '품목별' && summary.groups.length > 0 && (
            <Button
              variant="ghost" size="sm"
              onClick={() => {
                if (allCollapsed) return setCollapsed(new Set());
                setExpanded(new Set());
                setCollapsed(new Set(summary.groups.map((g) => g.categoryName)));
              }}
            >
              {allCollapsed ? '모두 펼치기' : '모두 접기'}
            </Button>
          )}
        </div>
      }
      actions={
        /* 줄 수 있어야 검색 칸이 준다 — 감싸개가 제 폭을 고집하면 `TableSearch` 의 `min-w-0` 이 듣지 않는다. */
        <div className="flex min-w-0 items-center gap-1.5">
          {onAddRack && <Button variant="secondary" size="sm" onClick={onAddRack}>랙 추가</Button>}
          {onAddEquipment && <Button variant="secondary" size="sm" onClick={() => onAddEquipment(selectedRackId ?? undefined)}>설비 추가</Button>}
          <TableSearch
            aria-label="현황 검색"
            className="w-40"
            placeholder="이름·품목·랙 검색"
            value={query}
            onChange={setQuery}
            shown={shown.length}
            total={rows.length}
          />
        </div>
      }
    >
      <TableCard fill columns={columns}>
        <thead>
          <tr className="sticky top-0 z-sticky">
            <Th>{view === '랙별' ? '랙 · 설비' : '분야 · 품목'}</Th>
            <Th align="right">개수</Th>
            <Th col="status">상태</Th>
            <Th>{view === '랙별' ? '품목' : '랙'}</Th>
            <Th col="model">모델</Th>
            <Th col="maker">제조사</Th>
            <Th col="install">설치일</Th>
            <Th col="inspected">최근 점검</Th>
          </tr>
        </thead>
        <tbody>
          {view === '품목별' && summary.groups.length === 0 && empty}
          {view === '품목별' && summary.groups.map((group) => (
            <Fragment key={group.categoryName}>
              <tr className={cn(TABLE_ROW, 'border-b-0 border-t', SELECTABLE)} onClick={() => setCollapsed((p) => toggle(p, group.categoryName))}>
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
                    <span className="min-w-0 truncate font-semibold">{group.categoryName}</span>
                  </span>
                </Td>
                <Td align="right" className="font-semibold text-content">{group.count}</Td>
                <RestCells after="count" />
              </tr>
              {!collapsed.has(group.categoryName) && group.items.map((item) => {
                const open = expanded.has(item.key);
                const bad = Object.entries(item.byStatus).filter(([v]) => v !== OK_STATUS);
                return (
                  <Fragment key={item.key}>
                    <tr className={cn(TABLE_ROW, SELECTABLE)} onClick={() => setExpanded((p) => toggle(p, item.key))}>
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
                        </span>
                      </Td>
                      <Td align="right" className="text-content">{item.count}</Td>
                      <Td col="status">
                        {bad.length > 0 && (
                          <span className="flex flex-wrap items-center gap-1">
                            {bad.map(([value, n]) => (
                              <StatusDot key={value} status={statusTone(value)}>{statusLabel(value)} {n}</StatusDot>
                            ))}
                          </span>
                        )}
                      </Td>
                      {(() => { const where = rackSummary(item.rows); return <Td className="truncate text-content-muted" title={where}>{where}</Td>; })()}
                      <RestCells after="where" />
                    </tr>
                    {open && item.rows.map((r) => equipmentRow(r, 'pl-14', rackCell(r)))}
                  </Fragment>
                );
              })}
            </Fragment>
          ))}

          {view === '랙별' && rackGroups.length === 0 && empty}
          {view === '랙별' && rackGroups.map(({ rack, rows: inRack }) => {
            /* 일체형 — 랙 안에 설비가 하나뿐이고 이름이 랙과 같으면 랙 행 하나로 그린다. */
            const only = inRack[0];
            if (only && inRack.length === 1 && perRack.get(rack.id) === 1 && only.name === rack.name) {
              return equipmentRow(only, '', [only.typeName, rack.typeName].filter(Boolean).join(' · '), `rack:${rack.id}`, 1);
            }
            return (
            <Fragment key={rack.id}>
              <tr
                {...(rack.id === NO_RACK ? {} : selectableRow(selectedRackId, rack.id, onSelectRack ?? noop))}
                className={cn(TABLE_ROW, 'border-b-0 border-t', rack.id !== NO_RACK && SELECTABLE, rack.id === selectedRackId && SELECTED)}
              >
                <Td className="truncate font-semibold text-content">{rack.name}</Td>
                <Td align="right" className="font-semibold text-content">{inRack.length}</Td>
                <Td col="status" />
                <Td className="truncate text-content-muted">{rack.typeName}</Td>
                <RestCells after="where" />
              </tr>
              {inRack.map((r) => equipmentRow(r, 'pl-8', r.typeName))}
            </Fragment>
            );
          })}
        </tbody>
      </TableCard>
    </ViewCard>
  );
}
