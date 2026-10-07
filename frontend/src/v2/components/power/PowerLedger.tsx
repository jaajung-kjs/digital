import { MAX_CIRCUITS, type LinkEndRef, type PowerBreaker, type PowerNode } from '@twin/core';
import {
  Button, EMPTY, HOVER_REVEAL, TABLE_ROW, TableCard, TableGroupHead, TableGroupHeadButton, Td, Th, cn,
} from '../../../components/ui';
import type { Circuit } from '../../model/types';
import { CircuitCell, type CircuitField } from '../equipment/CircuitCell';

/**
 * 차단기 · 표기 · 교류/직류 · 전압 · 용량 · 상 · 개폐 · 부하 · 포트 · 전원케이블 · 길이 · 용도 — 현장 분전반 시트 차례.
 * 내용 폭이 정해진 열은 px, 글이 들쭉날쭉한 열(표기·부하·전원케이블·용도)은 남은 폭을 24 : 28 : 18 : 30 으로 나눈다 —
 * 1280 에서 부하·용도가 먼저 읽혀야 한다.
 */
const WIDTHS = ['60px', 24, '68px', '60px', '64px', '48px', '56px', 28, '64px', 18, '56px', 30] as const;
const COLS = WIDTHS.length;
/** 고정 머리의 바닥선은 그림자다(선번장 블록과 같은 까닭 — 겹친 테두리는 sticky 를 따라오지 않는다). */
const HEAD = 'border-b-0 shadow-[inset_0_-1px_0_rgb(var(--border-2-rgb))]';

/** 블록 머리가 그리는 것 — 이름은 보는 쪽(`PowerView`)이 워킹카피에서 풀어 준다. */
export interface LedgerHead {
  name: string;
  /** 차단기 수(거르기 전 전체). */
  count: number;
  /** 입력 전원 — 「소내전원반 차단기 4」 여럿이면 차례대로. 비면 「입력 전원 미확인」. */
  feeds: string[];
}

export interface PowerLedgerProps {
  blocks: readonly PowerNode[];
  heads: ReadonlyMap<string, LedgerHead>;
  /** 블록 초점(`supply`). */
  focusId: string | null;
  /** 상세 패널에 열린 설비 — 그 설비를 부하로 둔 칸을 칠한다. */
  selectedEquipmentId: string | null;
  /** 부하가 설비 끝이 아닐 때(차단기·코어)의 이름. */
  label: (ref: LinkEndRef) => string;
  /** 부하 설비 이름. */
  nameOf: (equipmentId: string) => string;
  /** 연결의 케이블 품목 이름. */
  cableName: (cableTypeId: string) => string | null;
  /** 머리의 설비 이름 → 그 설비 선택 + 블록 초점. */
  onSelectSupply: (equipmentId: string) => void;
  onSelectEquipment: (equipmentId: string) => void;
  onConnect: (from: LinkEndRef) => void;
  onAddCircuit: (equipmentId: string) => void;
  onUpdateCircuit: (equipmentId: string, no: number, patch: Partial<Circuit>) => void;
}

const FIELDS_BEFORE_LOAD: readonly CircuitField[] = ['label', 'current', 'voltage', 'capacity', 'phase', 'switch'];

/**
 * 차단기 대장 — **공급 설비 하나 = 블록 하나**(현장 분전반 시트 한 장). 머리 = 설비 이름 · 차단기 수 / 입력 전원 / 「차단기 추가」.
 * 블록·차단기·부하·입력 전원은 core `powerLedger` 가 정하고 여기는 그릴 뿐이다. 칸 편집은 편집 창(`CircuitTable`)과
 * **같은 칸**(`CircuitCell`)이다. 마지막 차단기 삭제는 상세 패널 편집 창 한 곳에만 있다(같은 일에 문은 하나).
 */
export function PowerLedger({
  blocks, heads, focusId, selectedEquipmentId, label, nameOf, cableName,
  onSelectSupply, onSelectEquipment, onConnect, onAddCircuit, onUpdateCircuit,
}: PowerLedgerProps) {
  return (
    <div className="space-y-4">
      {blocks.map((n) => {
        const head = heads.get(n.equipmentId)!;
        const focused = focusId === n.equipmentId;
        const set = (no: number) => (patch: Partial<Circuit>) => onUpdateCircuit(n.equipmentId, no, patch);
        return (
          <section
            key={n.equipmentId}
            data-testid="ledger-block" data-equipment={n.equipmentId}
            aria-label={head.name}
            aria-current={focused ? 'true' : undefined}
            /* 표가 우선이다 — 상세 패널이 서서 판이 좁아지면 열을 짓누르지 않고 판이 가로로 구른다. */
            className={cn('min-w-[880px] scroll-mt-4', focused && 'outline outline-2 outline-primary')}
          >
            <TableCard widths={WIDTHS}>
              <thead className="sticky top-0 z-sticky bg-surface-2">
                <TableGroupHead
                  colSpan={COLS} className={HEAD} data-testid="ledger-block-head"
                  title={(
                    <>
                      <TableGroupHeadButton title={`${head.name} 상세 보기`} onClick={() => onSelectSupply(n.equipmentId)}>{head.name}</TableGroupHeadButton>
                      <span className="font-normal text-content-muted">· 차단기 {head.count}</span>
                    </>
                  )}
                  metas={[head.feeds.length > 0 ? `입력 전원: ${head.feeds.join(' · ')}` : { text: '입력 전원 미확인', tone: 'warning' }]}
                  actions={(
                    <Button variant="secondary" size="xs" disabled={head.count >= MAX_CIRCUITS} onClick={() => onAddCircuit(n.equipmentId)}>차단기 추가</Button>
                  )}
                />
                <tr>
                  <Th className={HEAD} align="right">차단기</Th>
                  <Th className={HEAD}>표기</Th>
                  <Th className={HEAD}>교류/직류</Th>
                  <Th className={HEAD} unit="V">전압</Th>
                  <Th className={HEAD} unit="A">용량</Th>
                  <Th className={HEAD}>상</Th>
                  <Th className={HEAD}>개폐</Th>
                  <Th className={HEAD}>부하</Th>
                  <Th className={HEAD}>포트</Th>
                  <Th className={HEAD}>전원케이블</Th>
                  <Th className={HEAD} align="right" unit="m">길이</Th>
                  <Th className={HEAD}>용도</Th>
                </tr>
              </thead>
              <tbody>
                {n.breakers.map((b) => (
                  <tr key={b.no} data-testid={`ledger-row-${b.no}`} className={cn(TABLE_ROW, 'group')}>
                    <Td align="right" data-col="no">{b.no}</Td>
                    {FIELDS_BEFORE_LOAD.map((f) => (
                      <Td key={f} data-col={f}><CircuitCell circuit={b} field={f} onSet={set(b.no)} /></Td>
                    ))}
                    <Td data-col="load">
                      <LoadCell
                        breaker={b} label={label} nameOf={nameOf} selectedEquipmentId={selectedEquipmentId}
                        onSelectEquipment={onSelectEquipment}
                        onConnect={() => onConnect({ kind: 'circuit', equipmentId: n.equipmentId, no: b.no })}
                      />
                    </Td>
                    <Td data-col="port" className="truncate" title={b.load?.kind === 'equipment' ? b.load.port ?? undefined : undefined}>
                      {b.load?.kind === 'equipment' && b.load.port ? b.load.port : <span className="text-content-faint">{EMPTY}</span>}
                    </Td>
                    {(() => {
                      const cable = b.cableTypeId ? cableName(b.cableTypeId) : null;
                      return <Td data-col="cable" className="truncate" title={cable ?? undefined}>{cable ?? <span className="text-content-faint">{EMPTY}</span>}</Td>;
                    })()}
                    <Td align="right" data-col="length">{b.lengthM != null ? b.lengthM : <span className="text-content-faint">{EMPTY}</span>}</Td>
                    <Td data-col="purpose"><CircuitCell circuit={b} field="purpose" onSet={set(b.no)} /></Td>
                  </tr>
                ))}
              </tbody>
            </TableCard>
          </section>
        );
      })}
    </div>
  );
}

/**
 * 부하 칸 — 설비 끝이면 그 설비 이름(누르면 그 설비 선택), 차단기·코어 끝이면 그 이름(읽기),
 * 없으면 「예비」(흐림) + 호버/터치 「연결」. 손잡이는 제 자리를 갖는다(§1.7).
 */
function LoadCell({ breaker, label, nameOf, selectedEquipmentId, onSelectEquipment, onConnect }: {
  breaker: PowerBreaker;
  label: (ref: LinkEndRef) => string;
  nameOf: (equipmentId: string) => string;
  selectedEquipmentId: string | null;
  onSelectEquipment: (equipmentId: string) => void;
  onConnect: () => void;
}) {
  const load = breaker.load;
  if (load == null) {
    return (
      <span className="flex min-w-0 items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-content-faint">예비</span>
        <span className={cn('shrink-0', HOVER_REVEAL)}>
          <Button variant="secondary" size="xs" onClick={onConnect}>연결</Button>
        </span>
      </span>
    );
  }
  if (load.kind === 'other') {
    const text = label(load.ref);
    return <span className="block truncate" title={text}>{text}</span>;
  }
  const name = nameOf(load.equipmentId);
  return (
    <button
      type="button" title={name}
      className={cn('block w-full min-w-0 truncate text-left hover:text-primary hover:underline', load.equipmentId === selectedEquipmentId && 'font-medium text-primary')}
      onClick={() => onSelectEquipment(load.equipmentId)}
    >
      {name}
    </button>
  );
}
