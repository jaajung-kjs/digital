import { useMemo } from 'react';
import { MAX_CIRCUITS, type LinkEndRef, type PowerBreaker, type PowerNode } from '@twin/core';
import {
  Button, TABLE_ROW, TableCard, TableGroupHead, TableGroupHeadButton, TableSubHead, cn, type TableGroupMeta,
} from '../../../components/ui';
import type { Circuit } from '../../model/types';
import {
  BreakerCells, BreakerHeadRow, breakerColumnsHiding, emptyBreakerColumns, type BreakerRowView,
} from '../equipment/breakerColumns';
import { EditOnly } from '../../useCanEdit';

/** 고정 머리의 바닥선은 그림자다(선번장 블록과 같은 까닭 — 겹친 테두리는 sticky 를 따라오지 않는다). */
const HEAD = 'border-b-0 shadow-[inset_0_-1px_0_rgb(var(--border-2-rgb))]';

/** 블록 머리가 그리는 것 — 이름은 보는 쪽(`PowerView`)이 워킹카피에서 풀어 준다. */
export interface LedgerHead {
  name: string;
  /** 차단기 수(거르기 전 전체). */
  count: number;
  /**
   * 입력 전원 메타 — 교류/직류별 「교류 입력: …」·「직류 입력: …」·「입력 전원: …」, 없으면 「입력 전원 미지정」. 보는 쪽이 짓는다.
   * 거른 보기에서도 모두 서고, 보기 밖 교류/직류는 흐리다(`faint`).
   */
  feeds: TableGroupMeta[];
  /** 모선(`PowerBus.key`)마다 소묶음 머리 — 이름(「교류 모선」)과 곁말(「입력: 소내전원반 차단기 4」). 모선이 하나면 쓰지 않는다. */
  buses: ReadonlyMap<string, { name: string; meta?: string }>;
}

export interface PowerLedgerProps {
  blocks: readonly PowerNode[];
  heads: ReadonlyMap<string, LedgerHead>;
  /** 교류/직류 거르기나 검색으로 줄을 좁혔다 — 머리의 차단기 수를 「보이는 수 / 전체」로 적는다. */
  narrowed?: boolean;
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

/**
 * 차단기 대장 — **공급 설비 하나 = 블록 하나**(현장 분전반 시트 한 장). 머리 = 설비 이름 · 차단기 수 / 입력 전원 / 「차단기 추가」.
 * 교류·직류를 함께 받는 설비(다모선 분전반)는 차단기를 모선으로 묶어 소묶음 머리 「교류 모선 · 입력: …」 아래에 둔다
 * (거르기·검색으로 비는 모선은 머리도 두지 않는다). 모선이 하나면 오늘과 같은 한 묶음이다.
 * 블록·차단기·부하·입력 전원은 core `powerLedger` 가 정하고 여기는 그릴 뿐이다. 열과 칸은 편집 창(`CircuitTable`)과
 * **같은 선언**(`breakerColumns`)이다. 마지막 차단기 삭제는 상세 패널 편집 창 한 곳에만 있다(같은 일에 문은 하나).
 */
export function PowerLedger({
  blocks, heads, narrowed = false, focusId, selectedEquipmentId, label, nameOf, cableName,
  onSelectSupply, onSelectEquipment, onConnect, onAddCircuit, onUpdateCircuit,
}: PowerLedgerProps) {
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((n) => (
        <LedgerBlock
          key={n.equipmentId} node={n} head={heads.get(n.equipmentId)!} narrowed={narrowed} focused={focusId === n.equipmentId}
          selectedEquipmentId={selectedEquipmentId} label={label} nameOf={nameOf} cableName={cableName}
          onSelectSupply={onSelectSupply} onSelectEquipment={onSelectEquipment} onConnect={onConnect}
          onAddCircuit={onAddCircuit} onUpdateCircuit={onUpdateCircuit}
        />
      ))}
    </div>
  );
}

/**
 * 블록 하나 — 열은 편집 창과 **같은 선언**(`BREAKER_COLUMNS`)이고, 판 폭에 따라 병합·숨는다(§1.7-e).
 * 블록 안에서 값이 모두 빈 열은 숨긴다(채우는 곳은 편집 창).
 */
function LedgerBlock({
  node: n, head, narrowed, focused, selectedEquipmentId, label, nameOf, cableName,
  onSelectSupply, onSelectEquipment, onConnect, onAddCircuit, onUpdateCircuit,
}: Omit<PowerLedgerProps, 'blocks' | 'heads' | 'focusId'> & { node: PowerNode; head: LedgerHead; focused: boolean }) {
  const view = (b: PowerBreaker): BreakerRowView => ({
    no: b.no,
    circuit: b,
    load: b.load == null ? null
      : b.load.kind === 'equipment'
        ? { equipmentId: b.load.equipmentId, name: nameOf(b.load.equipmentId), port: b.load.port }
        : { equipmentId: null, name: label(b.load.ref), port: null },
    cable: b.cableTypeId ? cableName(b.cableTypeId) : null,
    lengthM: b.lengthM,
  });
  const views = new Map(n.breakers.map((b) => [b.no, view(b)]));
  const hiddenKey = [...emptyBreakerColumns([...views.values()])].join(',');
  const columns = useMemo(() => breakerColumnsHiding(new Set(hiddenKey ? hiddenKey.split(',') : [])), [hiddenKey]);

  const row = (b: PowerBreaker) => (
    <tr key={b.no} data-testid={`ledger-row-${b.no}`} tabIndex={-1} className={cn(TABLE_ROW, 'group')}>
      <BreakerCells
        row={views.get(b.no)!}
        onSet={(patch: Partial<Circuit>) => onUpdateCircuit(n.equipmentId, b.no, patch)}
        onConnect={() => onConnect({ kind: 'circuit', equipmentId: n.equipmentId, no: b.no })}
        connectOnHover
        onSelectEquipment={onSelectEquipment}
        selectedEquipmentId={selectedEquipmentId}
      />
    </tr>
  );
  return (
    <section
      data-testid="ledger-block" data-equipment={n.equipmentId}
      aria-label={head.name}
      aria-current={focused ? 'true' : undefined}
      className={cn('scroll-mt-4', focused && 'outline outline-2 outline-primary')}
    >
      <TableCard columns={columns}>
        <thead className="sticky top-0 z-sticky bg-surface-2">
          <TableGroupHead
            className={HEAD} data-testid="ledger-block-head"
            title={(
              <>
                <TableGroupHeadButton title={`${head.name} 상세 보기`} onClick={() => onSelectSupply(n.equipmentId)}>{head.name}</TableGroupHeadButton>
                <span className="font-normal text-content-muted">· 차단기 {narrowed ? `${n.breakers.length} / ${head.count}` : head.count}</span>
              </>
            )}
            metas={head.feeds}
            wrapMetas
            actions={(
              <EditOnly>
                <Button variant="secondary" size="xs" disabled={head.count >= MAX_CIRCUITS} onClick={() => onAddCircuit(n.equipmentId)}>차단기 추가</Button>
              </EditOnly>
            )}
          />
          <BreakerHeadRow className={HEAD} />
        </thead>
        <tbody>
          {/* 한 줄로 펴서 줄 키(차단기 번호)를 고정한다 — 교류/직류를 바꿔 행이 다른 모선으로 옮겨도 같은 행이
              다시 쓰여(편집 칸이 새로 서지 않아) 초점을 잃지 않는다. */}
          {n.multiBus
            ? n.buses.filter((bus) => bus.breakers.length > 0).flatMap((bus) => [
              <TableSubHead
                key={`bus:${bus.key}`} data-testid="ledger-bus-head"
                name={head.buses.get(bus.key)?.name ?? ''} meta={head.buses.get(bus.key)?.meta}
              />,
              ...bus.breakers.map(row),
            ])
            : n.breakers.map(row)}
        </tbody>
      </TableCard>
    </section>
  );
}
