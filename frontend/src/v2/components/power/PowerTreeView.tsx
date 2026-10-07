import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { CIRCUIT_CURRENTS, type PowerBreaker } from '@twin/core';
import {
  Badge, Button, SelectionScope, StatusDot, TreeRow, selectOrToggle, useScrollSelectedIntoView, type BadgeStatus,
} from '../../../components/ui';
import { visibleTreeRows, type PowerTreeRow } from './powerSelectors';

/** 설비 줄에 적는 것 — 보는 쪽(`PowerView`)이 워킹카피·카탈로그에서 풀어 준다. */
export interface TreeEquipmentInfo {
  name: string;
  /** 품목 이름(흐림). */
  type: string | null;
  /** 정상이 아닐 때만 — 상태 어휘의 말과 톤. */
  status: { label: string; tone: BadgeStatus } | null;
}

export interface PowerTreeViewProps {
  /** 검색까지 거른 줄(접기 전). */
  rows: readonly PowerTreeRow[];
  /** 거르기 전 줄 — 「위에 표시됨」이 검색에 걸러진 처음 자리를 찾는다. */
  allRows: readonly PowerTreeRow[];
  /** 검색 중이면 접지 않는다 — 찾은 것이 접힌 가지 안에 있으면 「없다」로 읽힌다. */
  searching: boolean;
  /** 「위에 표시됨」의 처음 자리가 검색에 걸러졌으면 검색을 비운다. */
  onClearSearch: () => void;
  collapsed: ReadonlySet<string>;
  onCollapsedChange: (next: ReadonlySet<string>) => void;
  selectedEquipmentId: string | null;
  onSelectEquipment: (equipmentId: string | null) => void;
  info: (equipmentId: string) => TreeEquipmentInfo;
  /** 뿌리 설비 줄의 입력 전원 메타 — 없으면 「입력 전원 미등록」(흐림, 경고 아님). */
  rootMeta: (equipmentId: string) => string[];
  /** 부하가 설비 끝이 아닐 때(차단기·코어)의 이름. */
  otherLoad: (b: PowerBreaker) => string;
}

const currentWord = (v: string | null) => CIRCUIT_CURRENTS.find((c) => c.value === v)?.label ?? null;

/** 「차단기 3 · IP급전랙 · 30A · 교류」 — 빈 값은 건너뛴다. */
export const breakerText = (b: PowerBreaker) =>
  [`차단기 ${b.no}`, b.label, b.capacity, currentWord(b.current)].filter(Boolean).join(' · ');

/**
 * 계통도 — **입력 전원에서 부하까지** 왼쪽에서 오른쪽으로 들여 쓴 트리. 판정(뿌리·자식·예비·위에 표시됨·순환)은 core
 * `powerTree` 이고, 줄로 펴는 일은 `treeRows`, 여기는 그 줄을 그린다.
 *
 * - **설비 줄**(뿌리): 이름(굵게) · 품목(흐림) · 정상이 아니면 상태 · 입력 전원 메타(없으면 흐린 「입력 전원 미등록」).
 * - **차단기 줄**: 「차단기 3 · 표기 · 용량 · 갈래 →」 + 부하. 부하 설비가 차단기를 가지면 그 차단기들이 이 줄 아래에 선다
 *   (부하 설비 줄을 따로 두면 깊이가 두 배가 되어 6단이 1280 에서 잘린다 — 「→」 뒤가 곧 그 설비 줄이다).
 *   부하가 없으면 「예비」(흐림), 이미 위에서 펼친 설비면 이름 + 「위에 표시됨」(누르면 그 줄로), 고리면 「순환」(경고).
 * - 줄을 누르면 그 줄의 설비를 고른다(뿌리 = 그 설비, 차단기 줄 = 부하 설비, 부하가 설비가 아니면 그 차단기를 가진 설비).
 *   고른 가지를 다시 누르면 접고 편다(`selectOrToggle`). 판 하나가 Tab 하나를 받고 안은 화살표로 옮긴다(§1.7-k).
 */
export function PowerTreeView({
  rows, allRows, searching, onClearSearch, collapsed, onCollapsedChange,
  selectedEquipmentId, onSelectEquipment, info, rootMeta, otherLoad,
}: PowerTreeViewProps) {
  const shown = useMemo(() => (searching ? [...rows] : visibleTreeRows(rows, collapsed)), [rows, searching, collapsed]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  /** 「위에 표시됨」으로 데려갈 줄 — 조상을 편 뒤 그려지면 그리로 굴리고 초점을 준다. */
  const [revealKey, setRevealKey] = useState<string | null>(null);

  const listRef = useScrollSelectedIntoView<HTMLDivElement>(
    selectedEquipmentId != null && shown.some((r) => r.target === selectedEquipmentId) ? selectedEquipmentId : null,
    'center-if-needed',
  );

  const isCollapsed = (r: PowerTreeRow) => !searching && collapsed.has(r.key);
  const setRowCollapsed = (key: string, v: boolean) => {
    const next = new Set(collapsed);
    if (v) next.add(key); else next.delete(key);
    onCollapsedChange(next);
  };

  /** 그 설비를 처음 펼친 줄로 — 접힌 조상은 펴고, 검색에 걸러졌으면 검색을 비운다. */
  const reveal = (equipmentId: string) => {
    const anchor = allRows.find((r) => r.anchor && r.target === equipmentId);
    if (!anchor) return;
    if (!rows.some((r) => r.key === anchor.key)) onClearSearch();
    const byKey = new Map(allRows.map((r) => [r.key, r]));
    const next = new Set(collapsed);
    for (let k = anchor.parentKey; k != null; k = byKey.get(k)?.parentKey ?? null) next.delete(k);
    if (next.size !== collapsed.size) onCollapsedChange(next);
    setRevealKey(anchor.key);
  };
  useEffect(() => {
    if (!revealKey) return;
    const el = rowEl(revealKey);
    if (!el) return; // 아직 안 그려졌다 — 다음 그리기에서 다시 본다
    setRevealKey(null);
    setActiveKey(revealKey);
    el.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    el.focus({ preventScroll: true });
  });

  function rowEl(key: string): HTMLElement | null {
    return [...(listRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [])].find((el) => el.dataset.key === key) ?? null;
  }

  const activate = (r: PowerTreeRow) => {
    if (r.target == null) return onSelectEquipment(r.equipmentId);
    const target = r.target;
    selectOrToggle({
      selected: selectedEquipmentId === target,
      branch: r.branch ? { collapsed: isCollapsed(r), setCollapsed: (v) => setRowCollapsed(r.key, v) } : undefined,
      select: () => onSelectEquipment(target),
      deselect: () => onSelectEquipment(null),
    });
  };

  const moveFocus = (from: string, delta: number | 'first' | 'last') => {
    const els = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [])];
    if (els.length === 0) return;
    const i = els.findIndex((el) => el.dataset.key === from);
    const next = delta === 'first' ? els[0] : delta === 'last' ? els[els.length - 1] : els[Math.min(Math.max(i + delta, 0), els.length - 1)];
    if (!next) return;
    setActiveKey(next.dataset.key ?? null);
    next.focus();
  };

  const onKey = (r: PowerTreeRow) => (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); moveFocus(r.key, e.key === 'ArrowDown' ? 1 : -1); return; }
    if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); moveFocus(r.key, e.key === 'Home' ? 'first' : 'last'); return; }
    if (r.branch && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); setRowCollapsed(r.key, e.key === 'ArrowLeft'); return; }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    activate(r);
  };

  const selectedKey = shown.find((r) => r.target != null && r.target === selectedEquipmentId)?.key;
  const tabKey = (activeKey && shown.some((r) => r.key === activeKey) ? activeKey : null) ?? selectedKey ?? shown[0]?.key;

  return (
    <SelectionScope
      ref={listRef}
      onClear={() => onSelectEquipment(null)}
      className="min-h-0 flex-1 overflow-y-auto py-1"
      role="tree"
      aria-label="계통도"
    >
      {shown.map((r) => {
        const title = r.kind === 'equipment' ? info(r.equipmentId).name : `${breakerText(r.breaker!)} → ${loadTitle(r.breaker!)}`;
        return (
          <TreeRow
            key={r.key}
            data-key={r.key}
            data-testid={r.kind === 'equipment' ? 'tree-equipment' : 'tree-breaker'}
            data-anchor={r.anchor && r.target ? r.target : undefined}
            depth={r.depth}
            branch={r.branch}
            collapsed={isCollapsed(r)}
            onToggle={() => setRowCollapsed(r.key, !isCollapsed(r))}
            toggleLabel={r.kind === 'equipment' ? info(r.equipmentId).name : `${info(r.equipmentId).name} 차단기 ${r.breaker!.no}`}
            selected={r.target != null && r.target === selectedEquipmentId}
            tabIndex={tabKey === r.key ? 0 : -1}
            title={title}
            onFocus={() => setActiveKey(r.key)}
            onClick={(e) => {
              if ((e.target as Element).closest('button')) return;
              activate(r);
            }}
            onKeyDown={onKey(r)}
          >
            {r.kind === 'equipment'
              ? <EquipmentLabel info={info(r.equipmentId)} strong meta={rootMeta(r.equipmentId)} />
              : (
                <>
                  <span className="min-w-0 max-w-[50%] shrink-0 truncate">{breakerText(r.breaker!)}</span>
                  <span aria-hidden className="shrink-0 text-content-faint">→</span>
                  <Load breaker={r.breaker!} info={info} otherLoad={otherLoad} onReveal={reveal} />
                </>
              )}
          </TreeRow>
        );
      })}
    </SelectionScope>
  );

  function loadTitle(b: PowerBreaker): string {
    if (b.load == null) return '예비';
    if (b.load.kind === 'other') return otherLoad(b);
    const name = info(b.load.equipmentId).name;
    return b.cycle ? `${name} (순환)` : b.repeat ? `${name} (위에 표시됨)` : name;
  }
}

/** 설비 이름(굵게) · 품목(흐림) · 정상이 아닌 상태 · 메타(흐림) — 넘치면 이름부터 말줄임. */
function EquipmentLabel({ info, strong = false, meta = [], after }: { info: TreeEquipmentInfo; strong?: boolean; meta?: string[]; after?: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5">
      <span className={strong ? 'min-w-0 truncate font-semibold' : 'min-w-0 truncate font-medium'}>{info.name}</span>
      {info.type && <span className="shrink-0 text-xs text-content-muted">{info.type}</span>}
      {info.status && <span className="shrink-0"><StatusDot status={info.status.tone}>{info.status.label}</StatusDot></span>}
      {after}
      {meta.length > 0 && <span className="min-w-0 truncate text-xs text-content-muted">{meta.join(' · ')}</span>}
    </span>
  );
}

/** 차단기 줄의 부하 — 설비 · 예비 · 위에 표시됨 · 순환 · 설비가 아닌 끝(차단기·코어). */
function Load({ breaker: b, info, otherLoad, onReveal }: {
  breaker: PowerBreaker;
  info: (id: string) => TreeEquipmentInfo;
  otherLoad: (b: PowerBreaker) => string;
  onReveal: (equipmentId: string) => void;
}) {
  if (b.load == null) return <span className="min-w-0 flex-1 truncate text-content-faint">예비</span>;
  if (b.load.kind === 'other') return <span className="min-w-0 flex-1 truncate">{otherLoad(b)}</span>;
  const id = b.load.equipmentId;
  const after = b.cycle
    ? <Badge status="warning" className="shrink-0">순환</Badge>
    : b.repeat
      ? (
        <Button
          variant="ghost" size="xs" className="shrink-0"
          title="처음 표시된 줄로 이동"
          onClick={(e) => { e.stopPropagation(); onReveal(id); }}
        >
          위에 표시됨
        </Button>
      )
      : null;
  return <EquipmentLabel info={info(id)} after={after} />;
}
