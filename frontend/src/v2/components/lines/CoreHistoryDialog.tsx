import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { newestFirst, type Side } from '@twin/core';
import {
  Button, DateInput, EMPTY, ErrorStrip, IconButton, Input, ListHeading, Modal, TABLE_ROW, TableCard, Td, Th, formatDate, useConfirm,
} from '../../../components/ui';
import { deleteLeafRow } from '../../model/store/deleteActions';
import { effectiveRows } from '../../model/store/effective';
import { useWorkingCopy, workingCopyStore } from '../../model/store/workingCopy';
import type { CoreMeasurement } from '../../model/types';
import { newId } from '../../newId';
import { lineOf } from './sheetSelectors';
import {
  BLANK_DRAFT, MEASURE_COLS, NOT_A_NUMBER, dateIssue, draftHasBad, isBadCell, isBlankDraft, measurementOf, today, type MeasureDraft,
} from './measureDraft';

export interface CoreHistoryDialogProps {
  lineId: string;
  no: number;
  /** 이 국 쪽 끝 — 연 블록의 side. */
  side: Side;
  onClose: () => void;
}

/** 측정일 · 1310 dB · 1310 km · 1550 dB · 1550 km · 측정자 · 손잡이. */
const WIDTHS = ['136px', '72px', '72px', '72px', '72px', 100, '52px'] as const;
const num = (v: number | null) => (v == null ? EMPTY : String(v));
const other = (s: Side): Side => (s === 'A' ? 'B' : 'A');

/**
 * 코어 하나의 측정 이력 — **양 끝**. 위 묶음이 이쪽 끝(연 블록의 국), 아래가 상대 끝이고 각각 최근 먼저
 * (core `newestFirst` — 선번장의 최근 측정 칸과 같은 차례). 줄에 손을 얹으면 지우기, 맨 아래는 이쪽 끝
 * 한 줄 입력(`측정 추가`). 담는 곳은 워킹카피뿐이고 서버로 가는 문은 위 저장 바 하나다.
 */
export function CoreHistoryDialog({ lineId, no, side, onClose }: CoreHistoryDialogProps) {
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  const s = useMemo(() => ({ saved, overlays }), [saved, overlays]);
  const line = lineOf(s, lineId);
  const { confirm, confirmDialog } = useConfirm();

  const ms = useMemo(() => effectiveRows(s, 'coreMeasurements').filter((m) => m.lineId === lineId && m.coreNo === no), [s, lineId, no]);
  const of = (sd: Side) => newestFirst(ms.filter((m) => m.side === sd));
  const subName = (sd: Side) => (line ? (sd === 'A' ? line.aSubstationName : line.bSubstationName) : '');
  const lineTitle = line ? (line.name ?? `${line.aSubstationName} ↔ ${line.bSubstationName}`) : '';

  /* ── 측정 추가(이쪽 끝 한 줄) ── */
  const [measuredOn, setMeasuredOn] = useState(today);
  const [measuredBy, setMeasuredBy] = useState('');
  const [draft, setDraft] = useState<MeasureDraft>(BLANK_DRAFT);
  const dateBad = dateIssue(measuredOn);
  const bad = draftHasBad(draft);
  const ok = !dateBad && !bad && !isBlankDraft(draft);

  function add() {
    if (!ok) return;
    workingCopyStore.getState().create('coreMeasurements', measurementOf(draft, { id: newId(), lineId, coreNo: no, side, measuredOn, measuredBy }));
    setDraft(BLANK_DRAFT);
  }

  async function remove(m: CoreMeasurement) {
    const when = m.measuredOn ? formatDate(m.measuredOn) : '날짜 없는';
    if (!(await confirm({ title: '측정 지우기', target: `코어 ${no} · ${when} 측정`, message: '이 측정을 지웁니다.', confirmLabel: '지우기', danger: true }))) return;
    deleteLeafRow('coreMeasurements', m.id);
  }

  const head = (
    <tr>
      <Th>측정일</Th>
      {MEASURE_COLS.map((c) => <Th key={c.key} align="right" unit={c.unit} title={c.title}>{c.name}</Th>)}
      <Th>측정자</Th>
      <Th><span className="sr-only">손잡이</span></Th>
    </tr>
  );

  const group = (sd: Side) => {
    const rows = of(sd);
    /* 국 이름에 괄호가 든다(「(구)춘천S/S」) — 괄호로 감싸면 「상대 끝((구)춘천S/S)」로 겹쳐 읽힌다. */
    const label = `${sd === side ? '이쪽 끝' : '상대 끝'} · ${subName(sd)}`;
    return (
      <section aria-label={label} data-testid={`history-${sd === side ? 'near' : 'far'}`} className="space-y-1">
        <ListHeading>{label} · {rows.length}건</ListHeading>
        <TableCard widths={WIDTHS}>
          <thead>{head}</thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className={TABLE_ROW}><Td colSpan={WIDTHS.length} className="text-content-muted">측정이 없습니다</Td></tr>
            ) : rows.map((m) => (
              <tr key={m.id} data-testid="history-row" className={`${TABLE_ROW} group`}>
                <Td className="whitespace-nowrap tabular-nums">{m.measuredOn ? formatDate(m.measuredOn) : EMPTY}</Td>
                {MEASURE_COLS.map((c) => <Td key={c.key} align="right">{num(m[c.key])}</Td>)}
                <Td className="truncate" title={m.measuredBy ?? undefined}>{m.measuredBy ?? EMPTY}</Td>
                <Td align="right">
                  <span className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                    <IconButton size="sm" tone="danger" aria-label="측정 지우기" title="측정 지우기" onClick={() => void remove(m)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      </section>
    );
  };

  return (
    <Modal open onClose={onClose} size="lg" title={`코어 ${no} — ${lineTitle}`} footer={<Button variant="secondary" onClick={onClose}>닫기</Button>}>
      <div className="space-y-4">
        {group(side)}
        {group(other(side))}
        <section aria-label="측정 추가" className="space-y-1">
          <ListHeading>측정 추가 — 이쪽 끝 · {subName(side)}</ListHeading>
          <TableCard widths={WIDTHS}>
            <thead>{head}</thead>
            <tbody>
              <tr className={TABLE_ROW}>
                <Td><DateInput size="cell" aria-label="측정일" invalid={!!dateBad} title={dateBad ?? undefined} value={measuredOn} onChange={(e) => setMeasuredOn(e.currentTarget.value)} /></Td>
                {MEASURE_COLS.map((c) => {
                  const invalid = isBadCell(draft[c.key]);
                  return (
                    <Td key={c.key} align="right">
                      <Input
                        size="cell" numeric aria-label={c.title} invalid={invalid} title={invalid ? NOT_A_NUMBER : undefined}
                        value={draft[c.key]} onChange={(e) => { const v = e.currentTarget.value; setDraft((d) => ({ ...d, [c.key]: v })); }}
                      />
                    </Td>
                  );
                })}
                <Td><Input size="cell" aria-label="측정자" value={measuredBy} onChange={(e) => setMeasuredBy(e.currentTarget.value)} /></Td>
                <Td align="right"><Button size="xs" disabled={!ok} onClick={add}>추가</Button></Td>
              </tr>
            </tbody>
          </TableCard>
          <ErrorStrip message={bad ? NOT_A_NUMBER : dateBad && measuredOn.trim() !== '' ? dateBad : null} />
        </section>
      </div>
      {confirmDialog}
    </Modal>
  );
}
