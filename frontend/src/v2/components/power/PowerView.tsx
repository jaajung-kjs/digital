import { useEffect, useMemo, useRef, useState } from 'react';
import { CIRCUIT_CURRENTS, type CurrentFilter, type LinkEndRef, type PowerNode } from '@twin/core';
import {
  EMPTY, EmptyState, OverflowShade, SegmentedControl, Select, TableSearch, ViewCard, scrollBoxToTop, useOverflowShade, type SegmentedItem,
} from '../../../components/ui';
import { useCatalog } from '../../model/hooks';
import { addCircuit } from '../../model/store/deleteActions';
import { effectiveCircuits, equipmentName } from '../../model/store/effective';
import { useWorkingCopy, workingCopyStore, type WorkingCopyState } from '../../model/store/workingCopy';
import type { PowerView as PowerViewMode } from '../../useWorkspaceRoute';
import { ConnectDialog } from '../equipment/ConnectDialog';
import { endLabel } from '../equipment/endpoints';
import { PowerLedger, type LedgerHead } from './PowerLedger';
import { ledgerBlocks } from './powerSelectors';

/**
 * 입력 전원 메타 — 받는 차단기의 갈래로 묶는다: 「교류 입력: …」·「직류 입력: …」, 갈래가 비면 「입력 전원: …」.
 * 교류/직류 보기에서는 그 갈래만. 입력 연결이 하나도 없으면 「입력 전원 미등록」(흐림 — 국의 최상위 전원처럼 모델 밖에서
 * 받는 설비는 늘 그렇다, 경고가 아니다).
 */
function feedMetas(s: S, n: PowerNode, f: CurrentFilter): string[] {
  if (n.feeds.length === 0) return ['입력 전원 미등록'];
  const groups = new Map<string | null, string[]>();
  for (const feed of n.feeds) {
    const current = effectiveCircuits(s, feed.equipmentId).find((c) => c.no === feed.circuitNo)?.current ?? null;
    if (f !== 'all' && current !== f) continue;
    const arr = groups.get(current) ?? [];
    arr.push(endLabel(s, { kind: 'circuit', equipmentId: feed.equipmentId, no: feed.circuitNo }));
    groups.set(current, arr);
  }
  const head = (current: string | null) => {
    const word = CIRCUIT_CURRENTS.find((c) => c.value === current)?.label;
    return word ? `${word} 입력` : '입력 전원';
  };
  return [...CIRCUIT_CURRENTS.map((c) => c.value as string | null), null]
    .filter((k) => groups.has(k))
    .map((k) => `${head(k)}: ${groups.get(k)!.join(' · ')}`);
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
      });
    }
    return m;
  }, [all, s, filter]);
  const cableName = (id: string) => catalog?.cableTypes.find((c) => c.id === id)?.name ?? null;

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    const has = (t: string | null | undefined) => !!t && t.toLowerCase().includes(q);
    const out: PowerNode[] = [];
    for (const n of filtered) {
      if (n.breakers.length === 0) continue;
      if (q === '' || has(heads.get(n.equipmentId)?.name)) { out.push(n); continue; }
      const breakers = n.breakers.filter((b) => has(b.label) || has(b.purpose)
        || (b.load != null && has(b.load.kind === 'equipment' ? equipmentName(s, b.load.equipmentId) : endLabel(s, b.load.ref))));
      if (breakers.length > 0) out.push({ ...n, breakers });
    }
    return out;
  }, [filtered, q, heads, s]);
  const total = useMemo(() => all.reduce((k, n) => k + n.breakers.length, 0), [all]);
  const shownRows = shown.reduce((k, n) => k + n.breakers.length, 0);

  /* 초점 블록이 바뀔 때만 화면 안으로(주소로 들어온 경우 포함). */
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focus) return;
    /* 세로로만 — 레일이 서서 가로로 넘친 판을 옆으로 밀지 않는다. */
    scrollBoxToTop(bodyRef.current, bodyRef.current?.querySelector<HTMLElement>('[data-testid="ledger-block"][aria-current="true"]') ?? null);
  }, [focus]);
  /* 상세 레일이 서서 판이 좁아지면 가려진 오른쪽에 그늘(§1.7-e). */
  const shade = useOverflowShade(bodyRef);

  return (
    <div ref={shade.frameRef} className="relative flex min-h-0 min-w-0 flex-1">
      <ViewCard
        body="scroll"
        bodyRef={bodyRef}
        tools={(
          <>
            <SegmentedControl aria-label="전원 계통 보기" items={VIEWS} value={view} onChange={onView} />
            <div className="w-28 shrink-0">
              <Select size="sm" aria-label="교류/직류" value={filter} onChange={(e) => setFilter(e.currentTarget.value as CurrentFilter)}>
                <option value="all">전체</option>
                {CIRCUIT_CURRENTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            </div>
          </>
        )}
        actions={(
          <TableSearch
            aria-label="전원 계통 검색" className="w-72" placeholder="설비 · 차단기 표기 · 부하 · 용도 검색"
            value={query} onChange={setQuery} shown={shownRows} total={total}
          />
        )}
      >
        {view === 'tree' ? (
          /* 계통도는 다음 단계(Task 3)에서 선다. */
          <EmptyState title="계통도는 준비 중입니다" description="「차단기 대장」에서 공급 설비별 차단기를 조회할 수 있습니다" />
        ) : all.length === 0 ? (
          <EmptyState title="차단기가 있는 설비가 없습니다" description="분전반·UPS 등의 설비 상세에서 「차단기 추가」로 시작하세요" />
        ) : shown.length === 0 ? (
          <EmptyState title={q ? `'${query.trim()}'에 해당하는 차단기가 없습니다` : '조건에 해당하는 차단기가 없습니다'} />
        ) : (
          <PowerLedger
            blocks={shown}
            heads={heads}
            focusId={focus}
            selectedEquipmentId={selectedEquipmentId}
            label={label}
            nameOf={nameOf}
            cableName={cableName}
            onSelectSupply={onSelectSupply}
            onSelectEquipment={onSelectEquipment}
            onConnect={setConnectFrom}
            onAddCircuit={(id) => { addCircuit(id); }}
            onUpdateCircuit={(id, no, patch) => workingCopyStore.getState().updateCircuit(id, no, patch)}
          />
        )}
        {connectFrom && (
          <ConnectDialog substationId={substationId} from={connectFrom} open onClose={() => setConnectFrom(null)} onCreated={() => undefined} />
        )}
      </ViewCard>
      <OverflowShade top={shade.top} />
    </div>
  );
}
