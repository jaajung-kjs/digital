import { useMemo, useState } from 'react';
import { Button, DetailCard, DetailCardHeader, DetailRow, ErrorStrip, Input, isCommitKey } from '../../../components/ui';
import { effectiveRows } from '../../model/store/effective';
import { useWorkingCopy, workingCopyStore } from '../../model/store/workingCopy';
import { CircuitTable } from './CircuitTable';

const MAX_CIRCUITS = 999;

/** 회로 수 + 회로 표. 줄이기에서 잘릴 회로에 연결이 남아 있으면 줄이지 않고 까닭을 말한다. */
export function CircuitCard({ equipmentId, circuitCount }: { equipmentId: string; circuitCount: number }) {
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  const links = useMemo(() => effectiveRows({ saved, overlays }, 'links'), [saved, overlays]);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function apply(raw: string) {
    setDraft(null);
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isInteger(n) || n < 0 || n > MAX_CIRCUITS) return;
    if (n === circuitCount) { setError(null); return; }
    const cut = new Set<number>();
    for (const l of links) for (const e of [l.a, l.b]) if (e.kind === 'circuit' && e.equipmentId === equipmentId && e.no > n) cut.add(e.no);
    if (cut.size > 0) { setError(`연결이 남은 회로 ${cut.size}개를 잘라낼 수 없습니다`); return; }
    setError(null);
    workingCopyStore.getState().update('equipment', equipmentId, { circuitCount: n });
  }

  if (circuitCount === 0 && draft == null) {
    return (
      <DetailCard>
        <DetailCardHeader title="회로" actions={<Button variant="secondary" size="sm" onClick={() => apply('1')}>회로 추가</Button>} />
      </DetailCard>
    );
  }
  return (
    <DetailCard>
      <DetailCardHeader title="회로" />
      <DetailRow label="회로 수">
        <Input
          size="sm" numeric value={draft ?? String(circuitCount)}
          onChange={(e) => { setDraft(e.currentTarget.value); setError(null); }}
          onBlur={(e) => apply(e.currentTarget.value)}
          onKeyDown={(e) => { if (isCommitKey(e)) e.currentTarget.blur(); }}
        />
      </DetailRow>
      <ErrorStrip message={error} />
      <CircuitTable equipmentId={equipmentId} />
    </DetailCard>
  );
}
