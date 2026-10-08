import type { ReactNode } from 'react';
import { SWITCH_STATES } from '@twin/core';
import { Button, EMPTY, HOVER_REVEAL, Td, Th, cn, useTableLayout, type TableColumn } from '../../../components/ui';
import type { Circuit } from '../../model/types';
import { CircuitCell, type CircuitField } from './CircuitCell';
import { CIRCUIT_FIELD_LABELS as L } from './fieldLabels';
import { EditOnly } from '../../useCanEdit';

/**
 * **차단기 표의 열 선언 — 한 벌.** 차단기 대장(`PowerLedger`)과 차단기 편집 창(`CircuitTable`)이 같은 열을 같은 차례·
 * 같은 이름으로 그린다(현장 분전반 시트 차례): 차단기 · 표기 · 교류/직류 · 전압 · 용량 · 상 · 개폐 · 부하 · 포트 · 전원케이블 · 길이(m) · 비고.
 *
 * 판이 좁으면(§1.7-e) 「전압」+「용량」 → **「정격」**, 「포트」는 부하 칸 뒤에, 「길이」는 전원케이블 칸 뒤에 병합되고,
 * 상·개폐·비고가 숨는다. 숨은 값은 차단기 번호 칸의 `title` 에 모인다. 편집 창은 늘 다 세운다(`tier="wide"`).
 * 내용 폭이 정해진 열은 px(머리글 글자가 다 드는 폭), 글이 들쭉날쭉한 열(표기·부하·전원케이블·비고)은 남은 폭을 나눈다.
 */
export const BREAKER_COLUMNS: readonly TableColumn[] = [
  { key: 'no', width: '60px' },
  { key: 'label', width: 28 },
  { key: 'current', width: '76px' },
  { key: 'voltage', width: '60px', priority: 2 },
  { key: 'capacity', width: '60px', priority: 2 },
  { key: 'rating', width: '112px', merged: true },
  { key: 'phase', width: '44px', priority: 3 },
  { key: 'switch', width: '52px', priority: 3 },
  { key: 'load', width: 28 },
  { key: 'port', width: '72px', priority: 2 },
  { key: 'cable', width: 24 },
  { key: 'length', width: '72px', priority: 2 },
  { key: 'note', width: 20, priority: 3 },
];

/** 머리 이름 — 「용도」였던 칸은 현장 문서에 없는 말이라 「비고」로 부른다(저장 칸 `purpose` 는 그대로). */
const HEAD: Record<string, { name: string; unit?: string; align?: 'right' }> = {
  no: { name: '차단기', align: 'right' },
  label: { name: L.label },
  current: { name: L.current },
  voltage: { name: L.voltage },
  capacity: { name: L.capacity },
  rating: { name: '정격' },
  phase: { name: L.phase },
  switch: { name: L.switch },
  load: { name: '부하' },
  port: { name: '포트' },
  cable: { name: '전원케이블' },
  length: { name: '길이', unit: 'm', align: 'right' },
  note: { name: L.purpose },
};

/** 머리줄 — 지금 서는 열만(`Th col`). */
export function BreakerHeadRow({ className }: { className?: string }) {
  return (
    <tr>
      {BREAKER_COLUMNS.map((c) => {
        const h = HEAD[c.key]!;
        return <Th key={c.key} col={c.key} className={className} align={h.align} unit={h.unit}>{h.name}</Th>;
      })}
    </tr>
  );
}

/** 차단기 한 줄 — 대장의 `PowerBreaker` 든 편집 창의 차단기 + 연결이든 이 꼴로 읽는다. */
export interface BreakerRowView {
  no: number;
  circuit: Readonly<Record<CircuitField, string | null>>;
  /** 부하 — 설비면 이름과 그 설비 쪽 포트, 그 밖(차단기·코어)이면 이름만, 없으면 null(「—」). */
  load: { equipmentId: string | null; name: string; port: string | null } | null;
  cable: string | null;
  lengthM: number | null;
}

const faint = (v: ReactNode) => <span className="text-content-faint">{v}</span>;

/** 블록 안에서 값이 모두 빈 열(대장만 숨긴다 — 편집 창은 빈 칸을 채우는 곳이다). */
export function emptyBreakerColumns(rows: readonly BreakerRowView[]): Set<string> {
  const empty = new Set<string>();
  const all = (f: (r: BreakerRowView) => unknown) => rows.every((r) => f(r) == null || f(r) === '');
  if (all((r) => r.circuit.voltage)) empty.add('voltage');
  if (all((r) => r.circuit.capacity)) empty.add('capacity');
  if (empty.has('voltage') && empty.has('capacity')) empty.add('rating');
  if (all((r) => r.circuit.phase)) empty.add('phase');
  if (all((r) => r.circuit.switch)) empty.add('switch');
  if (all((r) => r.load?.port)) empty.add('port');
  if (all((r) => r.cable)) empty.add('cable');
  if (all((r) => r.lengthM)) empty.add('length');
  if (all((r) => r.circuit.purpose)) empty.add('note');
  return empty;
}

/** 열 선언에 블록의 빈 열을 얹는다. */
export const breakerColumnsHiding = (hidden: ReadonlySet<string>): readonly TableColumn[] =>
  hidden.size === 0 ? BREAKER_COLUMNS : BREAKER_COLUMNS.map((c) => (hidden.has(c.key) ? { ...c, hidden: true } : c));

/**
 * 차단기 한 줄의 칸들 — 순위로 숨거나 병합된 값은 차단기 번호 칸 `title` 에 모인다.
 * 부하 칸: 설비면 이름(`onSelectEquipment` 가 있으면 누를 수 있다), 없으면 「—」 + 「연결」(그 칸 안).
 */
export function BreakerCells({ row, onSet, onConnect, connectOnHover = false, onSelectEquipment, selectedEquipmentId, noCell }: {
  row: BreakerRowView;
  onSet: (patch: Partial<Circuit>) => void;
  onConnect: () => void;
  /** 「연결」을 줄에 손을 올릴 때만 세운다(대장 — 읽는 표). 편집 창은 늘 선다. */
  connectOnHover?: boolean;
  onSelectEquipment?: (equipmentId: string) => void;
  selectedEquipmentId?: string | null;
  /** 차단기 번호 칸의 내용(기본 번호 글자). */
  noCell?: ReactNode;
}) {
  const layout = useTableLayout();
  const c = row.circuit;
  const cell = (field: CircuitField) => <CircuitCell circuit={c} field={field} onSet={onSet} />;
  const port = row.load?.port ?? null;
  const length = row.lengthM != null ? `${row.lengthM} m` : null;
  /* 지금 서지 않는 칸의 값 — 번호 칸에 모은다(병합 칸에 이미 보이는 값은 빼고). */
  const hiddenText = [
    !layout.shows('voltage') && !layout.shows('rating') && c.voltage ? `${L.voltage} ${c.voltage}` : null,
    !layout.shows('capacity') && !layout.shows('rating') && c.capacity ? `${L.capacity} ${c.capacity}` : null,
    !layout.shows('phase') && c.phase ? `${L.phase} ${c.phase}` : null,
    !layout.shows('switch') && c.switch ? `${L.switch} ${SWITCH_STATES.find((x) => x.value === c.switch)?.label ?? c.switch}` : null,
    !layout.shows('note') && c.purpose ? `${L.purpose} ${c.purpose}` : null,
  ].filter(Boolean).join(' · ');

  const loadName = row.load == null ? null : row.load.equipmentId && onSelectEquipment ? (
    <button
      type="button" title={row.load.name}
      className={cn('min-w-0 truncate text-left hover:text-primary hover:underline', row.load.equipmentId === selectedEquipmentId && 'font-medium text-primary')}
      onClick={() => onSelectEquipment(row.load!.equipmentId!)}
    >
      {row.load.name}
    </button>
  ) : <span className="min-w-0 truncate" title={row.load.name}>{row.load.name}</span>;

  return (
    <>
      <Td align="right" col="no" title={hiddenText ? `차단기 ${row.no} · ${hiddenText}` : undefined}>{noCell ?? row.no}</Td>
      <Td col="label">{cell('label')}</Td>
      <Td col="current">{cell('current')}</Td>
      <Td col="voltage">{cell('voltage')}</Td>
      <Td col="capacity">{cell('capacity')}</Td>
      <Td col="rating">
        {/* 정격 = 전압 · 용량 — 두 칸이 그대로 고쳐진다(병합은 보는 꼴일 뿐). */}
        <span className="flex min-w-0 items-center gap-1">
          <span className="min-w-0 flex-1">{cell('voltage')}</span>
          <span aria-hidden className="shrink-0 text-content-faint">·</span>
          <span className="min-w-0 flex-1">{cell('capacity')}</span>
        </span>
      </Td>
      <Td col="phase">{cell('phase')}</Td>
      <Td col="switch">{cell('switch')}</Td>
      <Td col="load" data-testid="breaker-load">
        <span className="flex min-w-0 items-center gap-1">
          {row.load == null ? (
            <>
              <span className="min-w-0 flex-1 text-content-faint">{EMPTY}</span>
              <EditOnly>
                <span className={cn('shrink-0', connectOnHover && HOVER_REVEAL)}>
                  <Button variant="secondary" size="xs" onClick={onConnect}>연결</Button>
                </span>
              </EditOnly>
            </>
          ) : (
            <>
              {loadName}
              {/* 좁으면 포트가 부하 뒤에 선다(「UPS · AC IN」). */}
              {!layout.shows('port') && port && <span className="min-w-0 shrink truncate text-content-muted" title={`포트 ${port}`}>· {port}</span>}
            </>
          )}
        </span>
      </Td>
      <Td col="port" className="truncate" title={port ?? undefined}>{port ?? faint(EMPTY)}</Td>
      <Td col="cable" className="truncate" title={[row.cable, !layout.shows('length') ? length : null].filter(Boolean).join(' · ') || undefined}>
        {row.cable ?? faint(EMPTY)}
        {!layout.shows('length') && length && <span className="text-content-muted"> · {length}</span>}
      </Td>
      <Td col="length" align="right">{row.lengthM != null ? row.lengthM : faint(EMPTY)}</Td>
      <Td col="note">{cell('purpose')}</Td>
    </>
  );
}
