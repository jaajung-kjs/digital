import { useMemo, useState } from 'react';
import { CIRCUIT_CURRENTS, SWITCH_STATES, type CircuitCurrent, type SwitchState } from '@twin/core';
import { Button, TABLE_ROW, TableCard, Td, Th } from '../../../components/ui';
import { effectiveCircuits, effectiveRows } from '../../model/store/effective';
import { useWorkingCopy, workingCopyStore } from '../../model/store/workingCopy';
import type { Circuit } from '../../model/types';
import { InlineEditCell } from '../InlineEditCell';
import { ConnectDialog } from './ConnectDialog';
import { circuitLink, endLabel } from './endpoints';

const WIDTHS = [8, 16, 10, 12, 10, 8, 10, 12, 14];

type TextField = 'label' | 'voltage' | 'capacity' | 'phase' | 'purpose';

/** 설비의 회로 1..N 표 — 칸을 눌러 고치면 변경안(`updateCircuit`)에 실린다. */
export function CircuitTable({ equipmentId }: { equipmentId: string }) {
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  const rows = useMemo(() => effectiveCircuits({ saved, overlays }, equipmentId), [saved, overlays, equipmentId]);

  const links = useMemo(() => effectiveRows({ saved, overlays }, 'links'), [saved, overlays]);
  const substationId = useMemo(() => effectiveRows({ saved, overlays }, 'equipment').find((e) => e.id === equipmentId)?.substationId ?? null, [saved, overlays, equipmentId]);
  const [connectNo, setConnectNo] = useState<number | null>(null);

  const set = (no: number, patch: Partial<Circuit>) => workingCopyStore.getState().updateCircuit(equipmentId, no, patch);
  const text = (c: Circuit, field: TextField, label: string) => (
    <InlineEditCell
      value={c[field] ?? ''} label={label}
      onCommit={(raw) => { const next = raw.trim() || null; if (next !== c[field]) set(c.no, { [field]: next }); }}
    />
  );
  /* 갈래·개폐는 닫힌 어휘 — 칸에는 말(교류·투입)이, 변경안에는 값(AC·on)이 들어간다. */
  const current = (c: Circuit) => (
    <InlineEditCell
      value={c.current ?? ''} label="갈래" choices={CIRCUIT_CURRENTS}
      onCommit={(v) => { const next = (v || null) as CircuitCurrent | null; if (next !== c.current) set(c.no, { current: next }); }}
    />
  );
  const switchCell = (c: Circuit) => (
    <InlineEditCell
      value={c.switch ?? ''} label="개폐" choices={SWITCH_STATES}
      onCommit={(v) => { const next = (v || null) as SwitchState | null; if (next !== c.switch) set(c.no, { switch: next }); }}
    />
  );

  return (
    <>
      <TableCard widths={WIDTHS}>
        <thead>
          <tr>
            <Th>번호</Th><Th>표기</Th><Th>갈래</Th><Th>전압</Th><Th>용량</Th><Th>상</Th><Th>개폐</Th><Th>용도</Th><Th>연결</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.no} className={TABLE_ROW}>
              <Td><span data-testid="circuit-no">{c.no}</span></Td>
              <Td>{text(c, 'label', '표기')}</Td>
              <Td>{current(c)}</Td>
              <Td>{text(c, 'voltage', '전압')}</Td>
              <Td>{text(c, 'capacity', '용량')}</Td>
              <Td>{text(c, 'phase', '상')}</Td>
              <Td>{switchCell(c)}</Td>
              <Td>{text(c, 'purpose', '용도')}</Td>
              <Td>
                {(() => {
                  const hit = circuitLink(links, equipmentId, c.no);
                  return hit
                    ? <span className="block truncate text-sm">{endLabel({ saved, overlays }, hit.far)}</span>
                    : <Button variant="secondary" size="sm" onClick={() => setConnectNo(c.no)}>잇기</Button>;
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
