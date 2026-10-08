import { useEffect, useMemo, useRef, useState } from 'react';
import { CIRCUIT_CURRENTS, EQUIPMENT_STATUSES, type CurrentFilter, type LinkEndRef, type PowerBreaker, type PowerBus, type PowerFeed, type PowerNode } from '@twin/core';
import {
  Button, EMPTY, EmptyState, SegmentedControl, Select, TableSearch, ViewCard, scrollBoxToTop,
  type SegmentedItem, type TableGroupMeta,
} from '../../../components/ui';
import { useCatalog } from '../../model/hooks';
import { addCircuit } from '../../model/store/deleteActions';
import { bySubstation, effectiveCircuits, effectiveRows, equipmentName } from '../../model/store/effective';
import { useWorkingCopy, workingCopyStore, type WorkingCopyState } from '../../model/store/workingCopy';
import type { PowerView as PowerViewMode } from '../../useWorkspaceRoute';
import { ConnectDialog } from '../equipment/ConnectDialog';
import { endLabel } from '../equipment/endpoints';
import { PowerLedger, type LedgerHead } from './PowerLedger';
import { busName, ledgerBlocks, searchTreeRows, treeRows } from './powerSelectors';
import { PowerTreeView, type TreeEquipmentInfo } from './PowerTreeView';
import { equipmentStatusTone } from '../../tones';

const STATUS = new Map(EQUIPMENT_STATUSES.map((st) => [st.value as string, st]));
/* 톤은 `equipmentStatusTone`(tones.ts) 한 곳 — 정상(success)은 계통도에 세우지 않는다. */

/** 입력 전원 하나를 받는 차단기의 교류/직류. */
const feedCurrent = (s: S, f: PowerFeed) => effectiveCircuits(s, f.equipmentId).find((c) => c.no === f.circuitNo)?.current ?? null;
const feedName = (s: S, f: PowerFeed) => endLabel(s, { kind: 'circuit', equipmentId: f.equipmentId, no: f.circuitNo });

/** 거른 보기 밖의 입력 전원에 붙는 말 — 흐리게 서는 까닭. */
const OUTSIDE_VIEW = '현재 보기 밖의 입력';

/**
 * 입력 전원 메타 — 받는 차단기의 교류/직류로 묶는다: 「교류 입력: …」·「직류 입력: …」, 교류/직류가 비면 「입력 전원: …」.
 * **거르기와 무관하게 모두** 적는다(거른 보기에서 입력 줄이 사라지면 어디서 받는지를 잃는다) — 교류/직류 보기에서
 * 다른 교류/직류의 입력은 한 단 흐리게(title 「현재 보기 밖의 입력」). 입력 연결이 하나도 없으면 「입력 전원 미지정」
 * (흐림 — 국의 최상위 전원처럼 모델 밖에서 받는 설비는 늘 그렇다, 경고가 아니다).
 */
function feedMetas(s: S, n: PowerNode, f: CurrentFilter): TableGroupMeta[] {
  if (n.feeds.length === 0) return [{ text: '입력 전원 미지정' }];
  const groups = new Map<string | null, string[]>();
  for (const feed of n.feeds) {
    const current = feedCurrent(s, feed);
    const arr = groups.get(current) ?? [];
    arr.push(feedName(s, feed));
    groups.set(current, arr);
  }
  const head = (current: string | null) => {
    const word = CIRCUIT_CURRENTS.find((c) => c.value === current)?.label;
    return word ? `${word} 입력` : '입력 전원';
  };
  return [...CIRCUIT_CURRENTS.map((c) => c.value as string | null), null]
    .filter((k) => groups.has(k))
    .map((k) => {
      const text = `${head(k)}: ${groups.get(k)!.join(' · ')}`;
      return f !== 'all' && k !== f ? { text, faint: true, title: `${text} — ${OUTSIDE_VIEW}` } : { text };
    });
}

/**
 * 모선 소묶음 머리의 곁말 — 「입력: 소내전원반 차단기 4 · UPS 차단기 1」, 없으면 「입력 전원 미지정」.
 * 「교류/직류 미지정」 묶음은 입력이 없는 것이 당연하므로(받는 모선을 모른다) 곁말을 달지 않는다.
 */
function busFeedText(s: S, bus: PowerBus): string | undefined {
  if (bus.feeds.length === 0) return bus.current == null ? undefined : '입력 전원 미지정';
  return `입력: ${bus.feeds.map((f) => feedName(s, f)).join(' · ')}`;
}

type S = Pick<WorkingCopyState, 'saved' | 'overlays'>;

const VIEWS: readonly SegmentedItem<PowerViewMode>[] = [
  { key: 'ledger', label: '차단기 대장' },
  { key: 'tree', label: '계통도' },
];

export interface PowerViewProps {
  substationId: string;
  view: PowerViewMode;
  onView: (view: PowerViewMode) => void;
  /** 블록 초점(`supply`). */
  focus: string | null;
  selectedEquipmentId: string | null;
  /** 블록 머리의 설비 이름 → 그 설비 선택 + 블록 초점(한 번의 주소 쓰기). */
  onSelectSupply: (equipmentId: string) => void;
  onSelectEquipment: (equipmentId: string | null) => void;
}

/**
 * 전원 계통 — 도구줄 한 줄(보기 전환 · 교류/직류 · 검색) + 보기. 판정은 core(`powerLedger`)이고 여기는 거르고 그린다.
 * 검색은 설비 이름(블록 전체)과 차단기 표기·부하·용도(그 줄)를 본다. 줄이 다 걸러진 블록은 숨긴다.
 */
export function PowerView({ substationId, view, onView, focus, selectedEquipmentId, onSelectSupply, onSelectEquipment }: PowerViewProps) {
  const catalog = useCatalog().data;
  const saved = useWorkingCopy((st) => st.saved);
  const overlays = useWorkingCopy((st) => st.overlays);
  const s = useMemo(() => ({ saved, overlays }), [saved, overlays]);
  const [filter, setFilter] = useState<CurrentFilter>('all');
  const [query, setQuery] = useState('');
  const [connectFrom, setConnectFrom] = useState<LinkEndRef | null>(null);
  /** 계통도에서 접은 줄(줄 키) — 도구줄의 「모두 펼치기 / 모두 접기」가 함께 쥔다. */
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const all = useMemo(() => ledgerBlocks(s, substationId, 'all'), [s, substationId]);
  const filtered = useMemo(() => (filter === 'all' ? all : ledgerBlocks(s, substationId, filter)), [all, s, substationId, filter]);

  const nameOf = (id: string) => equipmentName(s, id) ?? EMPTY;
  const label = (ref: LinkEndRef) => endLabel(s, ref);
  const heads = useMemo(() => {
    const m = new Map<string, LedgerHead>();
    for (const n of all) {
      m.set(n.equipmentId, {
        name: equipmentName(s, n.equipmentId) ?? EMPTY,
        count: n.breakers.length,
        feeds: feedMetas(s, n, filter),
        buses: new Map(n.buses.map((b) => [b.key, { name: busName(b.current), meta: busFeedText(s, b) }])),
      });
    }
    return m;
  }, [all, s, filter]);
  const cableName = (id: string) => catalog?.cableTypes.find((c) => c.id === id)?.name ?? null;

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    const has = (t: string | null | undefined) => !!t && t.toLowerCase().includes(q);
    const hit = (b: PowerBreaker) => has(b.label) || has(b.purpose)
      || (b.load != null && has(b.load.kind === 'equipment' ? equipmentName(s, b.load.equipmentId) : endLabel(s, b.load.ref)));
    const out: PowerNode[] = [];
    for (const n of filtered) {
      if (n.breakers.length === 0) continue;
      if (q === '' || has(heads.get(n.equipmentId)?.name)) { out.push(n); continue; }
      const buses = n.buses.map((b) => ({ ...b, breakers: b.breakers.filter(hit) }));
      const breakers = n.breakers.filter(hit);
      if (breakers.length > 0) out.push({ ...n, buses, breakers });
    }
    return out;
  }, [filtered, q, heads, s]);
  const total = useMemo(() => all.reduce((k, n) => k + n.breakers.length, 0), [all]);
  const shownRows = shown.reduce((k, n) => k + n.breakers.length, 0);

  /* 계통도 — 줄로 편 트리(거르기 적용) → 검색(맞는 줄과 그 조상). 건수는 맞는 줄 수. */
  const otherLoad = (b: PowerBreaker) => (b.load?.kind === 'other' ? endLabel(s, b.load.ref) : '');
  const loadText = (b: PowerBreaker) => (b.load == null ? '' : b.load.kind === 'equipment' ? equipmentName(s, b.load.equipmentId) ?? '' : endLabel(s, b.load.ref));
  const tree = useMemo(
    () => (view === 'tree' ? treeRows(s, substationId, filter, loadText) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, s, substationId, filter],
  );
  const treeShown = useMemo(() => searchTreeRows(tree, q), [tree, q]);
  /* 계통도의 건수도 차단기 줄을 센다 — 대장과 같은 것. */
  const treeTotal = useMemo(() => tree.filter((r) => r.kind === 'breaker').length, [tree]);
  const equipmentInfo = useMemo(() => {
    const types = new Map((catalog?.equipmentTypes ?? []).map((t) => [t.id, t.name]));
    const m = new Map<string, TreeEquipmentInfo>();
    for (const e of bySubstation(effectiveRows(s, 'equipment'), substationId)) {
      const st = STATUS.get(e.status);
      m.set(e.id, {
        name: e.name || EMPTY,
        type: types.get(e.typeId) ?? null,
        status: st && st.tone !== 'success' ? { label: st.label, tone: equipmentStatusTone(e.status) } : null,
      });
    }
    return m;
  }, [s, substationId, catalog]);
  const info = (id: string): TreeEquipmentInfo => equipmentInfo.get(id) ?? { name: equipmentName(s, id) ?? EMPTY, type: null, status: null };
  /** 뿌리 줄의 입력 전원 — 모선이 여럿인 설비는 그 모선으로 들어오는 것만(설비 전체의 교류·직류 입력을 다 적지 않는다). */
  const rootMeta = (id: string, bus: string | null) => {
    const n = all.find((x) => x.equipmentId === id);
    if (!n) return [];
    const own = n.multiBus ? n.buses.find((b) => b.key === bus) : undefined;
    return feedMetas(s, own ? { ...n, feeds: own.feeds } : n, 'all').map((m) => m.text);
  };
  const isTree = view === 'tree';

  /* 본문 상자 — 보기를 바꿔 본문 요소가 바뀌어도 ref 가 새 요소에 붙는다. */
  const bodyRef = useRef<HTMLDivElement>(null);
  /**
   * 초점 블록이 **밖에서** 바뀔 때만 화면 안으로(주소·상세 패널의 「차단기 대장에서 보기」). 대장에서 블록 머리의
   * 이름을 누른 것은 굴리지 않는다 — 누른 머리는 이미 손 밑에 있다(계통도의 규칙과 같다).
   */
  const localFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!focus) { localFocus.current = null; return; }
    if (localFocus.current === focus) { localFocus.current = null; return; }
    localFocus.current = null;
    const body = bodyRef.current;
    scrollBoxToTop(body, body?.querySelector<HTMLElement>('[data-testid="ledger-block"][aria-current="true"]') ?? null);
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps
  const selectSupplyHere = (id: string) => { localFocus.current = id; onSelectSupply(id); };

  /**
   * 「차단기 추가」 — 거른 보기에서는 그 교류/직류로 만든다(교류/직류 없는 새 줄은 거르기에 걸려 보이지 않는다). 검색 중이면 검색을 비운다
   * (새 줄은 빈 줄이라 어떤 검색에도 걸리지 않는다). 그린 뒤 새 줄을 화면 안으로 옮기고 초점을 준다.
   */
  const [added, setAdded] = useState<{ equipmentId: string; no: number } | null>(null);
  const addBreaker = (equipmentId: string) => {
    const no = addCircuit(equipmentId, filter === 'all' ? {} : { current: filter });
    if (no == null) return;
    if (q !== '') setQuery('');
    setAdded({ equipmentId, no });
  };
  useEffect(() => {
    if (!added) return;
    setAdded(null);
    const body = bodyRef.current;
    const row = body?.querySelector<HTMLElement>(`[data-testid="ledger-block"][data-equipment="${added.equipmentId}"] [data-testid="ledger-row-${added.no}"]`);
    if (!body || !row) return;
    /* 세로로만, 가려져 있을 때만 — 줄이 판 아래로 나갔으면 바닥에 닿게 굴린다. */
    const box = body.parentElement;
    if (box) {
      const r = row.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      if (r.bottom > b.bottom || r.top < b.top) box.scrollTo?.({ top: box.scrollTop + (r.bottom > b.bottom ? r.bottom - b.bottom + 16 : r.top - b.top - 16) });
    }
    row.focus({ preventScroll: true });
  }, [added]); // eslint-disable-line react-hooks/exhaustive-deps

  const branchKeys = tree.filter((r) => r.branch).map((r) => r.key);
  const allCollapsed = branchKeys.length > 0 && branchKeys.every((k) => collapsed.has(k));

  return (
      <ViewCard
        body={isTree ? 'fill' : 'scroll'}
        bodyRef={bodyRef}
        tools={(
          <>
            <SegmentedControl aria-label="전원 계통 보기" items={VIEWS} value={view} onChange={onView} />
            <div className="w-32 shrink-0">
              <Select size="sm" aria-label="교류/직류" value={filter} onChange={(e) => setFilter(e.currentTarget.value as CurrentFilter)}>
                <option value="all">교류/직류 전체</option>
                {CIRCUIT_CURRENTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            </div>
            {isTree && (
              <>
                {/* 글자 단추 **하나**(§1.7-h 아이콘만으로는 모른다) — 현황의 「모두 펼치기/접기」와 같은 꼴·자리. 둘을 세우면
                    1280 + 레일에서 검색 칸이 w-40 아래로 눌렸다. */}
                <Button variant="ghost" size="sm" onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(branchKeys))}>
                  {allCollapsed ? '모두 펼치기' : '모두 접기'}
                </Button>
              </>
            )}
          </>
        )}
        actions={(
          <TableSearch
            aria-label="전원 계통 검색" className="w-64 min-w-40" placeholder="설비·차단기·부하 검색"
            value={query} onChange={setQuery} shown={isTree ? treeShown.matched : shownRows} total={isTree ? treeTotal : total}
          />
        )}
      >
        {all.length === 0 ? (
          <EmptyState title="차단기가 있는 설비가 없습니다" description="분전반·UPS 등의 설비 상세에서 「차단기 추가」를 누르세요" />
        ) : isTree ? (
          treeShown.rows.length === 0 ? (
            <EmptyState title={q ? `'${query.trim()}'에 해당하는 설비·차단기가 없습니다` : '조건에 해당하는 차단기가 없습니다'} />
          ) : (
            <PowerTreeView
              rows={treeShown.rows} allRows={tree} searching={q !== ''} onClearSearch={() => setQuery('')}
              collapsed={collapsed} onCollapsedChange={setCollapsed}
              selectedEquipmentId={selectedEquipmentId} onSelectEquipment={onSelectEquipment}
              info={info} rootMeta={rootMeta} otherLoad={otherLoad}
            />
          )
        ) : shown.length === 0 ? (
          <EmptyState title={q ? `'${query.trim()}'에 해당하는 차단기가 없습니다` : '조건에 해당하는 차단기가 없습니다'} />
        ) : (
          <PowerLedger
            blocks={shown}
            heads={heads}
            narrowed={filter !== 'all' || q !== ''}
            focusId={focus}
            selectedEquipmentId={selectedEquipmentId}
            label={label}
            nameOf={nameOf}
            cableName={cableName}
            onSelectSupply={selectSupplyHere}
            onSelectEquipment={onSelectEquipment}
            onConnect={setConnectFrom}
            onAddCircuit={addBreaker}
            onUpdateCircuit={(id, no, patch) => workingCopyStore.getState().updateCircuit(id, no, patch)}
          />
        )}
        {connectFrom && (
          <ConnectDialog substationId={substationId} from={connectFrom} open onClose={() => setConnectFrom(null)} onCreated={() => undefined} />
        )}
      </ViewCard>
  );
}
