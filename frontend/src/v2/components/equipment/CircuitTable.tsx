import { useEffect, useMemo, useRef, useState } from 'react';
import { SELECTED, TABLE_ROW, TableCard, cn } from '../../../components/ui';
import { effectiveCircuits, effectiveRows } from '../../model/store/effective';
import { useWorkingCopy, workingCopyStore } from '../../model/store/workingCopy';
import type { Circuit } from '../../model/types';
import { useCatalog } from '../../model/hooks';
import { BREAKER_COLUMNS, BreakerCells, BreakerHeadRow, type BreakerRowView } from './breakerColumns';
import { ConnectDialog } from './ConnectDialog';
import { circuitLink, endLabel } from './endpoints';

/**
 * 설비의 차단기 1..N 표 — **차단기 편집 창(`BreakerEditor`) 안에서만** 쓴다. 열은 차단기 대장과 **같은 선언**(`BREAKER_COLUMNS`)
 * 이고 빈 열도 다 선다(빈 칸을 채우는 곳이다, `tier="wide"`). 칸을 눌러 고치면 변경안(`updateCircuit`)에 실린다.
 * `focusNo` 줄은 표시하고 화면 안으로 굴린다.
 */
export function CircuitTable({ equipmentId, focusNo = null }: { equipmentId: string; focusNo?: number | null }) {
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  const rows = useMemo(() => effectiveCircuits({ saved, overlays }, equipmentId), [saved, overlays, equipmentId]);
  const cableTypes = useCatalog().data?.cableTypes;

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
  /** 대장과 같은 꼴로 읽는다 — 부하는 연결의 상대 끝, 포트는 그 설비 쪽 표기. */
  const view = (c: Circuit): BreakerRowView => {
    const hit = circuitLink(links, equipmentId, c.no);
    const far = hit?.far ?? null;
    return {
      no: c.no,
      circuit: c,
      load: far == null ? null
        : far.kind === 'equipment'
          ? { equipmentId: far.equipmentId, name: endLabel({ saved, overlays }, { kind: 'equipment', equipmentId: far.equipmentId }), port: far.label ?? null }
          : { equipmentId: null, name: endLabel({ saved, overlays }, far), port: null },
      cable: hit?.link.cableTypeId ? cableTypes?.find((t) => t.id === hit.link.cableTypeId)?.name ?? null : null,
      lengthM: hit?.link.lengthM ?? null,
    };
  };

  return (
    <>
      <TableCard columns={BREAKER_COLUMNS} tier="wide">
        <thead>
          <BreakerHeadRow />
        </thead>
        <tbody ref={bodyRef}>
          {rows.map((c) => (
            <tr key={c.no} data-testid={`circuit-row-${c.no}`} aria-current={c.no === focusNo ? 'true' : undefined} className={cn(TABLE_ROW, c.no === focusNo && SELECTED)}>
              <BreakerCells
                row={view(c)} onSet={set(c.no)} onConnect={() => setConnectNo(c.no)}
                noCell={<span data-testid="circuit-no">{c.no}</span>}
              />
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
