import { useMemo } from 'react';
import { TABLE_ROW, TableCard, Td, Th } from '../../../components/ui';
import { effectiveCircuits } from '../../model/store/effective';
import { useWorkingCopy, workingCopyStore } from '../../model/store/workingCopy';
import type { Circuit } from '../../model/types';
import { InlineEditCell } from '../InlineEditCell';

const WIDTHS = [8, 18, 12, 14, 12, 10, 12, 14];
const CURRENT_OPTIONS = ['교류', '직류'] as const;
const SWITCH_OPTIONS = ['투입', '개방'] as const;

type TextField = 'label' | 'voltage' | 'capacity' | 'phase' | 'purpose';

/** 설비의 회로 1..N 표 — 칸을 눌러 고치면 변경안(`updateCircuit`)에 실린다. */
export function CircuitTable({ equipmentId }: { equipmentId: string }) {
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  const rows = useMemo(() => effectiveCircuits({ saved, overlays }, equipmentId), [saved, overlays, equipmentId]);

  const set = (no: number, patch: Partial<Circuit>) => workingCopyStore.getState().updateCircuit(equipmentId, no, patch);
  const commit = (no: number, field: keyof Circuit, current: string | null, raw: string) => {
    const next = raw.trim() || null;
    if (next !== current) set(no, { [field]: next });
  };
  const cell = (c: Circuit, field: 'current' | 'switch' | TextField, label: string, options?: readonly string[]) => (
    <InlineEditCell value={c[field] ?? ''} label={label} options={options} onCommit={(v) => commit(c.no, field, c[field], v)} />
  );

  return (
    <TableCard widths={WIDTHS}>
      <thead>
        <tr>
          <Th>번호</Th><Th>표기</Th><Th>갈래</Th><Th>전압</Th><Th>용량</Th><Th>상</Th><Th>개폐</Th><Th>용도</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.no} className={TABLE_ROW}>
            <Td><span data-testid="circuit-no">{c.no}</span></Td>
            <Td>{cell(c, 'label', '표기')}</Td>
            <Td>{cell(c, 'current', '갈래', CURRENT_OPTIONS)}</Td>
            <Td>{cell(c, 'voltage', '전압')}</Td>
            <Td>{cell(c, 'capacity', '용량')}</Td>
            <Td>{cell(c, 'phase', '상')}</Td>
            <Td>{cell(c, 'switch', '개폐', SWITCH_OPTIONS)}</Td>
            <Td>{cell(c, 'purpose', '용도')}</Td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );
}
