import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, SELECTED, TABLE_ROW, TableCard, Td, Th, cn } from '../../../components/ui';
import { effectiveCircuits, effectiveRows } from '../../model/store/effective';
import { useWorkingCopy, workingCopyStore } from '../../model/store/workingCopy';
import type { Circuit } from '../../model/types';
import { CircuitCell, type CircuitField } from './CircuitCell';
import { ConnectDialog } from './ConnectDialog';
import { circuitLink, endLabel } from './endpoints';

const WIDTHS = [5, 22, 8, 9, 8, 6, 8, 12, 22];

/**
 * 설비의 차단기 1..N 표 — **차단기 편집 창(`BreakerEditor`) 안에서만** 쓴다(좁은 패널에 9열 표를 두면 글자가
 * 세로로 쪼개진다). 칸을 눌러 고치면 변경안(`updateCircuit`)에 실린다. `focusNo` 줄은 표시하고 화면 안으로 굴린다.
 */
export function CircuitTable({ equipmentId, focusNo = null }: { equipmentId: string; focusNo?: number | null }) {
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  const rows = useMemo(() => effectiveCircuits({ saved, overlays }, equipmentId), [saved, overlays, equipmentId]);

  const links = useMemo(() => effectiveRows({ saved, overlays }, 'links'), [saved, overlays]);
  const substationId = useMemo(() => effectiveRows({ saved, overlays }, 'equipment').find((e) => e.id === equipmentId)?.substationId ?? null, [saved, overlays, equipmentId]);
  const [connectNo, setConnectNo] = useState<number | null>(null);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  /* 고른 줄이 바뀔 때만 굴린다 — 보이면 가만히(`nearest`). */
  useEffect(() => {
    if (focusNo == null) return;
    bodyRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [focusNo]);

  const set = (no: number) => (patch: Partial<Circuit>) => workingCopyStore.getState().updateCircuit(equipmentId, no, patch);
  const cell = (c: Circuit, field: CircuitField) => <CircuitCell circuit={c} field={field} onSet={set(c.no)} />;

  return (
    <>
      <TableCard widths={WIDTHS}>
        <thead>
          <tr>
            <Th>번호</Th><Th>표기</Th><Th>교류/직류</Th><Th>전압</Th><Th>용량</Th><Th>상</Th><Th>개폐</Th><Th>용도</Th><Th>연결(부하)</Th>
          </tr>
        </thead>
        <tbody ref={bodyRef}>
          {rows.map((c) => (
            <tr key={c.no} data-testid={`circuit-row-${c.no}`} aria-current={c.no === focusNo ? 'true' : undefined} className={cn(TABLE_ROW, c.no === focusNo && SELECTED)}>
              <Td><span data-testid="circuit-no">{c.no}</span></Td>
              <Td>{cell(c, 'label')}</Td>
              <Td>{cell(c, 'current')}</Td>
              <Td>{cell(c, 'voltage')}</Td>
              <Td>{cell(c, 'capacity')}</Td>
              <Td>{cell(c, 'phase')}</Td>
              <Td>{cell(c, 'switch')}</Td>
              <Td>{cell(c, 'purpose')}</Td>
              <Td>
                {(() => {
                  const hit = circuitLink(links, equipmentId, c.no);
                  return hit
                    ? <span className="block truncate text-sm">{endLabel({ saved, overlays }, hit.far)}</span>
                    : <Button variant="secondary" size="xs" onClick={() => setConnectNo(c.no)}>연결</Button>;
                })()}
              </Td>
            </tr>
          ))}
        </tbody>
      </TableCard>
      {substationId && connectNo !== null && (
        <ConnectDialog substationId={substationId} from={{ kind: 'circuit', equipmentId, no: connectNo }} open onClose={() => setConnectNo(null)} onCreated={() => undefined} />
      )}
    </>
  );
}
