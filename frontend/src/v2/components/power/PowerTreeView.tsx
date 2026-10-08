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
  /** 거르기 전 줄 — 「상단 참조」가 검색에 걸러진 처음 자리를 찾는다. */
  allRows: readonly PowerTreeRow[];
  /** 검색 중이면 접지 않는다 — 찾은 것이 접힌 가지 안에 있으면 「없다」로 읽힌다. */
  searching: boolean;
  /** 「상단 참조」의 처음 자리가 검색에 걸러졌으면 검색을 비운다. */
  onClearSearch: () => void;
  collapsed: ReadonlySet<string>;
  onCollapsedChange: (next: ReadonlySet<string>) => void;
  selectedEquipmentId: string | null;
  onSelectEquipment: (equipmentId: string | null) => void;
  info: (equipmentId: string) => TreeEquipmentInfo;
  /** 뿌리 설비 줄의 입력 전원 메타 — 모선이 여럿이면 그 모선의 입력만, 없으면 「입력 전원 미지정」(흐림, 경고 아님). */
  rootMeta: (equipmentId: string, bus: string | null) => string[];
  /** 부하가 설비 끝이 아닐 때(차단기·코어)의 이름. */
  otherLoad: (b: PowerBreaker) => string;
}

const currentWord = (v: string | null) => CIRCUIT_CURRENTS.find((c) => c.value === v)?.label ?? null;

/** 「차단기 3 · IP급전랙 · 30A · 교류」 — 빈 값은 건너뛴다. */
const breakerText = (b: PowerBreaker) =>
  [`차단기 ${b.no}`, b.label, b.capacity, currentWord(b.current)].filter(Boolean).join(' · ');

/** 「상위 설비 공급」의 뜻 — 고리처럼 보이지만 분전반의 UPS 모선처럼 정상인 구성이다(경고가 아니다). */
const FEEDBACK_TITLE = '상위 설비의 모선으로 다시 공급되는 계통(분전반의 UPS 모선 등)';

/**
 * 계통도 — **입력 전원에서 부하까지** 왼쪽에서 오른쪽으로 들여 쓴 트리. 판정(뿌리·자식·예비·상단 참조·상위 설비 공급·모선)은
 * core `powerTree` 이고, 줄로 펴는 일은 `treeRows`, 여기는 그 줄을 그린다.
 *
 * - **설비 줄**(뿌리): 이름(굵게) · 품목(흐림, 이름과 같으면 생략) · 모선(여럿일 때) · 정상이 아니면 상태 · 입력 전원 메타(없으면 흐린 「입력 전원 미지정」).
 * - **차단기 줄**: 「차단기 3 · 표기 · 용량 · 교류/직류 →」 + 부하. 부하 설비가 차단기를 가지면 그 차단기들이 이 줄 아래에 선다
 *   (부하 설비 줄을 따로 두면 깊이가 두 배가 되어 6단이 1280 에서 잘린다 — 「→」 뒤가 곧 그 설비 줄이다).
 *   교류·직류를 함께 받는 설비(다모선 분전반)는 들어간 모선만 펼치고 이름 뒤에 「교류 모선」·「직류 모선」을 적는다 —
 *   충전기 직류 차단기 아래의 분전반은 그 직류 모선이다.
 *   부하가 없으면 「예비」(흐림), 그 (설비, 모선)을 이미 위에서 펼쳤으면 이름 + 「상단 참조」, 같은 교류/직류로 위 단계 모선에 되돌아가면
 *   (core 의 `cycle` — UPS 교류 출력이 분전반 교류 모선으로) 흐린 배지 「상위 설비 공급」. 둘 다 누르면 그 모선을 펼친 줄로 데려가고
 *   선택도 그 줄로 옮긴다(표시는 한 곳).
 * - 줄을 누르면 그 줄의 설비를 고른다(뿌리 = 그 설비, 차단기 줄 = 부하 설비, 부하가 설비가 아니면 그 차단기를 가진 설비).
 *   **불은 누른 그 줄에만** 들어온다 — 같은 설비가 여러 줄에 서도(상단 참조 · 예비의 주인) 위쪽 줄로 시선이 튀지 않는다.
 *   여기서 고른 것은 화면을 굴리지 않는다(누른 줄은 이미 손 밑에 있다). 밖(상세 패널·주소)에서 고른 것만 화면 안으로 옮긴다.
 *   고른 가지를 다시 누르면 접고 편다(`selectOrToggle`). 판 하나가 Tab 하나를 받고 안은 화살표로 옮긴다(§1.7-k, WAI-ARIA Tree).
 */
export function PowerTreeView({
  rows, allRows, searching, onClearSearch, collapsed, onCollapsedChange,
  selectedEquipmentId, onSelectEquipment, info, rootMeta, otherLoad,
}: PowerTreeViewProps) {
  const shown = useMemo(() => (searching ? [...rows] : visibleTreeRows(rows, collapsed)), [rows, searching, collapsed]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  /** 「상단 참조」·「상위 설비 공급」으로 데려갈 줄 — 조상을 편 뒤 그려지면 그리로 굴리고 초점을 준다(한 번만 해 본다). */
  const [revealKey, setRevealKey] = useState<string | null>(null);
  /** 이 트리에서 누른 줄과 그때 고른 설비 — 불은 이 줄에만, 화면은 굴리지 않는다. */
  const [picked, setPicked] = useState<{ key: string; id: string } | null>(null);

  /** 이 줄을 누르면 고르는 설비. */
  const pickOf = (r: PowerTreeRow) => r.target ?? r.equipmentId;
  const pickedHere = picked != null && picked.id === selectedEquipmentId && shown.some((r) => r.key === picked.key);
  const isSelected = (r: PowerTreeRow) => (pickedHere ? r.key === picked!.key : r.target != null && r.target === selectedEquipmentId);

  const listRef = useScrollSelectedIntoView<HTMLDivElement>(
    !pickedHere && selectedEquipmentId != null && shown.some((r) => r.target === selectedEquipmentId) ? selectedEquipmentId : null,
    'center-if-needed',
  );

  const isCollapsed = (r: PowerTreeRow) => !searching && collapsed.has(r.key);
  const setRowCollapsed = (key: string, v: boolean) => {
    const next = new Set(collapsed);
    if (v) next.add(key); else next.delete(key);
    onCollapsedChange(next);
  };
  /** 지금 보이는 자식이 있는가 — 검색 중에는 걸러진 가지에 펼친 셰브런을 세우지 않는다. */
  const hasShownChild = useMemo(() => new Set(shown.map((r) => r.parentKey).filter((k): k is string => k != null)), [shown]);
  const branchOf = (r: PowerTreeRow) => (searching ? hasShownChild.has(r.key) : r.branch);

  /**
   * 그 (설비, 모선)을 펼친 줄로 — 접힌 조상은 펴고, 검색에 걸러졌으면 검색을 비운다. 선택도 그 줄로 옮긴다 —
   * 누른 줄의 불과 데려간 줄의 표시가 둘로 서지 않게(데려간 줄 하나에만).
   */
  const reveal = (equipmentId: string, bus: string | null) => {
    const anchor = allRows.find((r) => r.anchor && r.target === equipmentId && (bus == null || r.targetBus === bus))
      ?? allRows.find((r) => r.anchor && r.target === equipmentId);
    if (!anchor) return;
    setPicked({ key: anchor.key, id: equipmentId });
    if (selectedEquipmentId !== equipmentId) onSelectEquipment(equipmentId);
    if (!rows.some((r) => r.key === anchor.key)) onClearSearch();
    const byKey = new Map(allRows.map((r) => [r.key, r]));
    const next = new Set(collapsed);
    for (let k = anchor.parentKey; k != null; k = byKey.get(k)?.parentKey ?? null) next.delete(k);
    if (next.size !== collapsed.size) onCollapsedChange(next);
    setRevealKey(anchor.key);
  };
  useEffect(() => {
    if (!revealKey) return;
    /* 한 번만 해 본다 — 접기·검색 비우기는 같은 손짓에서 함께 그려지므로 이 그리기에 줄이 있다. 없으면(그사이 사라짐) 버린다. */
    const el = rowEl(revealKey);
    setRevealKey(null);
    if (!el) return;
    setActiveKey(revealKey);
    el.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    el.focus({ preventScroll: true });
  }, [revealKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function rowEl(key: string): HTMLElement | null {
    return [...(listRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [])].find((el) => el.dataset.key === key) ?? null;
  }

  const activate = (r: PowerTreeRow) => {
    const id = pickOf(r);
    const branch = branchOf(r);
    selectOrToggle({
      selected: selectedEquipmentId === id && isSelected(r),
      branch: branch && r.target != null ? { collapsed: isCollapsed(r), setCollapsed: (v) => setRowCollapsed(r.key, v) } : undefined,
      select: () => { setPicked({ key: r.key, id }); onSelectEquipment(id); },
      deselect: () => { setPicked(null); onSelectEquipment(null); },
    });
  };

  const focusRow = (el: HTMLElement | null | undefined) => {
    if (!el) return;
    setActiveKey(el.dataset.key ?? null);
    el.focus();
  };
  const moveFocus = (from: string, delta: number | 'first' | 'last') => {
    const els = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [])];
    if (els.length === 0) return;
    const i = els.findIndex((el) => el.dataset.key === from);
    focusRow(delta === 'first' ? els[0] : delta === 'last' ? els[els.length - 1] : els[Math.min(Math.max(i + delta, 0), els.length - 1)]);
  };

  /** 화살표 — ↑↓ 옮기기, → 닫힌 가지는 펴고 열린 가지는 첫 자식으로, ← 열린 가지는 접고 아니면 부모로(WAI-ARIA Tree). */
  const onKey = (r: PowerTreeRow) => (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); moveFocus(r.key, e.key === 'ArrowDown' ? 1 : -1); return; }
    if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); moveFocus(r.key, e.key === 'Home' ? 'first' : 'last'); return; }
    const open = branchOf(r) && !isCollapsed(r);
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (!branchOf(r)) return;
      if (!open) setRowCollapsed(r.key, false);
      else focusRow(rowEl(shown.find((x) => x.parentKey === r.key)?.key ?? ''));
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (open) setRowCollapsed(r.key, true);
      else if (r.parentKey) focusRow(rowEl(r.parentKey));
      return;
    }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    activate(r);
  };

  const selectedKey = shown.find(isSelected)?.key;
  const tabKey = (activeKey && shown.some((r) => r.key === activeKey) ? activeKey : null) ?? selectedKey ?? shown[0]?.key;

  return (
    <SelectionScope
      ref={listRef}
      onClear={() => { setPicked(null); onSelectEquipment(null); }}
      className="min-h-0 flex-1 overflow-y-auto py-1"
      role="tree"
      aria-label="계통도"
    >
      {shown.map((r) => {
        const title = r.kind === 'equipment' ? info(r.equipmentId).name
          : r.kind === 'group' ? `${info(r.equipmentId).name} ${r.busLabel ?? ''}`
            : `${breakerText(r.breaker!)} → ${loadTitle(r.breaker!)}`;
        const branch = branchOf(r);
        return (
          <TreeRow
            key={r.key}
            data-key={r.key}
            data-testid={r.kind === 'equipment' ? 'tree-equipment' : r.kind === 'group' ? 'tree-group' : 'tree-breaker'}
            data-anchor={r.anchor && r.target ? r.target : undefined}
            data-bus={r.anchor && r.target ? r.targetBus ?? undefined : undefined}
            depth={r.depth}
            branch={branch}
            collapsed={isCollapsed(r)}
            onToggle={() => setRowCollapsed(r.key, !isCollapsed(r))}
            toggleLabel={r.kind === 'breaker' ? `${info(r.equipmentId).name} 차단기 ${r.breaker!.no}` : title}
            selected={isSelected(r)}
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
              ? <EquipmentLabel info={info(r.equipmentId)} strong bus={r.busLabel} meta={rootMeta(r.equipmentId, r.targetBus)} />
              : r.kind === 'group'
                ? <span className="min-w-0 flex-1 truncate text-xs text-content-muted">{r.busLabel}</span>
                : (
                <>
                  <span className="min-w-0 max-w-[50%] shrink-0 truncate">{breakerText(r.breaker!)}</span>
                  <span aria-hidden className="shrink-0 text-content-faint">→</span>
                  <Load row={r} info={info} otherLoad={otherLoad} onReveal={reveal} />
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
    return b.cycle ? `${name} (상위 설비 공급 — ${FEEDBACK_TITLE})` : b.repeat ? `${name} (상단 참조)` : name;
  }
}

/** 설비 이름(굵게) · 품목(흐림, 이름과 같으면 생략) · 모선(여럿일 때) · 정상이 아닌 상태 · 메타(흐림) — 넘치면 이름부터 말줄임. */
function EquipmentLabel({ info, strong = false, bus = null, meta = [], after }: {
  info: TreeEquipmentInfo; strong?: boolean; bus?: string | null; meta?: string[]; after?: ReactNode;
}) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5">
      <span className={strong ? 'min-w-0 truncate font-semibold' : 'min-w-0 truncate font-medium'}>{info.name}</span>
      {info.type && info.type !== info.name && <span className="shrink-0 text-xs text-content-muted">{info.type}</span>}
      {bus && <span data-testid="tree-bus" className="shrink-0 text-xs text-content">{bus}</span>}
      {info.status && <span className="shrink-0"><StatusDot status={info.status.tone}>{info.status.label}</StatusDot></span>}
      {after}
      {meta.length > 0 && <span className="min-w-0 truncate text-xs text-content-muted">{meta.join(' · ')}</span>}
    </span>
  );
}

/**
 * 차단기 줄의 부하 — 설비(모선이 여럿이면 들어간 모선) · 예비 · 상단 참조 · 상위 설비 공급 · 설비가 아닌 끝(차단기·코어).
 * 「상단 참조」와 「상위 설비 공급」은 같은 손잡이다 — 누르면 그 (설비, 모선)을 펼친 줄로 간다.
 */
function Load({ row, info, otherLoad, onReveal }: {
  row: PowerTreeRow;
  info: (id: string) => TreeEquipmentInfo;
  otherLoad: (b: PowerBreaker) => string;
  onReveal: (equipmentId: string, bus: string | null) => void;
}) {
  const b = row.breaker!;
  if (b.load == null) return <span className="min-w-0 flex-1 truncate text-content-faint">예비</span>;
  if (b.load.kind === 'other') return <span className="min-w-0 flex-1 truncate">{otherLoad(b)}</span>;
  const id = b.load.equipmentId;
  const go = (e: { stopPropagation: () => void }) => { e.stopPropagation(); onReveal(id, b.loadBus); };
  const after = b.cycle
    ? (
      <button type="button" className="shrink-0 rounded-full focus-ring" title={FEEDBACK_TITLE} aria-label="상위 설비 공급 — 해당 설비 행으로 이동" onClick={go}>
        <Badge status="neutral">상위 설비 공급</Badge>
      </button>
    )
    : b.repeat
      ? <Button variant="ghost" size="xs" className="shrink-0" title="처음 표시된 행으로 이동" aria-label="상단 참조 — 해당 설비 행으로 이동" onClick={go}>상단 참조</Button>
      : null;
  return <EquipmentLabel info={info(id)} bus={row.busLabel} after={after} />;
}
