import { useMemo, useState, type KeyboardEvent } from 'react';
import type { SheetBlock } from '@twin/core';
import {
  Button, DateInput, DetailCard, DetailRow, ErrorStrip, Input, Modal, TABLE_ROW, TableCard, Td, Th,
  isCommitKey, useConfirm, latestMeasureText,
} from '../../../components/ui';
import { useWorkingCopy, workingCopyStore } from '../../model/store/workingCopy';
import { blockWhere } from './sheetSelectors';
import { MeasureHeadRows } from './MeasureHeadRows';
import { newId } from '../../newId';
import { coreRuns } from '../../model/store/deleteActions';
import {
  BLANK_DRAFT, MEASURE_COLS, NOT_A_NUMBER, dateIssue, draftHasBad, isBadCell, isBlankDraft, measurementOf, today, type MeasureDraft, type MeasureKey,
} from './measureDraft';

/** 지금 최근 측정 한 줄 — 선번장과 같은 꼴(`latestMeasureText`): 「2024-10-08 · 1310 -6.435 dB · 1550 -4.420 dB · 18.747 km」. */
const latestText = (m: SheetBlock['rows'][number]['latest']) => latestMeasureText(m, { withDate: true });

export interface MeasureBatchDialogProps {
  block: SheetBlock;
  onClose: () => void;
}

/* 수 칸은 손실·거리 몇 자리만큼만 — 넓히면 값이 칸 오른쪽 끝에 홀로 선다. 남은 폭은 지금의 최근 측정(견주어 보며 적는다). */
const WIDTHS = ['56px', '64px', '104px', '104px', '104px', '104px', 100] as const;

/**
 * 블록 한 번에 측정 입력 — 엑셀 선번장이 블록마다 OTDR 측정일 하나를 적는 그대로. 위에 측정일(오늘)·측정자,
 * 아래 코어 1..N 줄 × 1310 dB · 1310 km · 1550 dB · 1550 km.
 *
 * 칸 사이는 Tab(옆)·Enter(아래)로 옮긴다. **네 칸이 다 빈 줄은 측정을 만들지 않는다**(Review Focus 5) — 잰 코어만
 * 채우면 된다. 수가 아닌 칸은 그 칸이 붉고 아래에 까닭이 서며 `넣기` 가 잠긴다. 손실은 음수 그대로 받는다.
 * `넣기` = 채운 줄마다 측정 한 건(이 블록의 끝), 한 번의 되돌리기로 함께 물러난다.
 */
export function MeasureBatchDialog({ block, onClose }: MeasureBatchDialogProps) {
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  /* 제목은 블록에서 짓는다 — 부르는 쪽 머리가 비어도 「측정 입력 — ↔ 」로 무너지지 않게. */
  const { where, peer } = useMemo(() => blockWhere({ saved, overlays }, block), [saved, overlays, block]);
  const { confirm, confirmDialog } = useConfirm();
  const [measuredOn, setMeasuredOn] = useState(today);
  const [measuredBy, setMeasuredBy] = useState('');
  /* 고친 줄만 든다 — 나머지는 빈 줄. */
  const [drafts, setDrafts] = useState<Record<number, MeasureDraft>>({});

  const draftOf = (no: number) => drafts[no] ?? BLANK_DRAFT;
  const set = (no: number, key: MeasureKey, v: string) => setDrafts((d) => ({ ...d, [no]: { ...(d[no] ?? BLANK_DRAFT), [key]: v } }));

  const filled = useMemo(() => block.rows.filter((r) => drafts[r.no] && !isBlankDraft(drafts[r.no]!)), [block.rows, drafts]);
  /* 친 것이 있으면 닫기 전에 묻는다(Esc · ✕ · 취소) — 스무 줄을 친 뒤 Esc 한 번에 날아가지 않게. */
  async function requestClose() {
    if (filled.length > 0 && !(await confirm({ title: '측정 등록 취소', target: null, message: `입력한 ${filled.length}건을 취소하시겠습니까?`, confirmLabel: '입력 취소', cancelLabel: '계속 입력', danger: true }))) return;
    onClose();
  }
  const bad = useMemo(() => block.rows.filter((r) => drafts[r.no] && draftHasBad(drafts[r.no]!)).map((r) => r.no), [block.rows, drafts]);
  const dateBad = dateIssue(measuredOn);
  const ok = !dateBad && bad.length === 0 && filled.length > 0;

  function submit() {
    if (!ok) return;
    workingCopyStore.getState().createMany('coreMeasurements', filled.map((r) => measurementOf(draftOf(r.no), {
      id: newId(), lineId: block.lineId, coreNo: r.no, side: block.side, measuredOn, measuredBy,
    })));
    onClose();
  }

  /* Enter = 아래 칸(같은 열), Shift+Enter = 위 칸 — 엑셀의 어법. 한글 조합 중의 Enter 는 IME 의 것이다. */
  function onCellKey(e: KeyboardEvent<HTMLInputElement>, row: number, col: number) {
    if (!isCommitKey(e)) return;
    e.preventDefault();
    const next = row + (e.shiftKey ? -1 : 1);
    e.currentTarget.closest('table')?.querySelector<HTMLInputElement>(`input[data-cell="${next}:${col}"]`)?.focus();
  }

  return (
    <Modal
      open onClose={() => void requestClose()} size="xl" title={`측정 등록 — ${where} ↔ ${peer}`}
      footer={
        <>
          <span className="mr-auto text-xs text-content-muted">
            {bad.length > 0
              ? '입력 오류가 있습니다'
              : filled.length > 0 ? `${filled.length}건을 등록합니다 — 빈 행은 등록하지 않습니다` : '측정한 코어만 입력하세요 — 빈 행은 등록하지 않습니다'}
          </span>
          <Button variant="secondary" onClick={() => void requestClose()}>취소</Button>
          <Button disabled={!ok} onClick={submit}>등록</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <DetailCard>
          <DetailRow label="측정일" required issue={dateBad}>
            <DateInput size="sm" aria-label="측정일" invalid={!!dateBad} value={measuredOn} onChange={(e) => setMeasuredOn(e.currentTarget.value)} />
          </DetailRow>
          <DetailRow label="측정자">
            <Input size="sm" aria-label="측정자" value={measuredBy} onChange={(e) => setMeasuredBy(e.currentTarget.value)} />
          </DetailRow>
        </DetailCard>
        <div className="max-h-[50vh] overflow-y-auto">
          <TableCard widths={WIDTHS}>
            <thead className="sticky top-0 z-sticky">
              <MeasureHeadRows
                lead={<><Th rowSpan={2} align="right">코어</Th><Th rowSpan={2} align="right">어댑터</Th></>}
                trail={<Th rowSpan={2}>최근 측정</Th>}
              />
            </thead>
            <tbody>
              {block.rows.map((r, ri) => {
                const d = draftOf(r.no);
                return (
                  <tr key={r.no} data-testid={`measure-row-${r.no}`} className={TABLE_ROW}>
                    <Td align="right">{r.no}</Td>
                    <Td align="right" className="text-content-muted">{r.jack}</Td>
                    {MEASURE_COLS.map((c, ci) => {
                      const invalid = isBadCell(d[c.key]);
                      return (
                        <Td key={c.key} align="right">
                          <Input
                            size="cell" numeric data-cell={`${ri}:${ci}`}
                            aria-label={`코어 ${r.no} ${c.title}`} invalid={invalid} title={invalid ? NOT_A_NUMBER : undefined}
                            value={d[c.key]}
                            onChange={(e) => set(r.no, c.key, e.currentTarget.value)}
                            onKeyDown={(e) => onCellKey(e, ri, ci)}
                          />
                        </Td>
                      );
                    })}
                    <Td data-col="latest" className="truncate text-content-muted" title={r.latest ? latestText(r.latest) : undefined}>{latestText(r.latest)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </TableCard>
        </div>
        <ErrorStrip message={bad.length > 0 ? `${NOT_A_NUMBER} — 코어 ${coreRuns(bad)}` : null} />
      </div>
      {confirmDialog}
    </Modal>
  );
}
