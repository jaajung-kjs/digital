import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { LinkEndRef } from '@twin/core';
import { Button, DetailCard, DetailCardHeader, EmptyState, ErrorStrip, IconButton } from '../../../components/ui';
import { useCatalog } from '../../model/hooks';
import { deleteRows } from '../../model/store/deleteActions';
import { useWorkingCopy, workingCopyStore } from '../../model/store/workingCopy';
import type { Link } from '../../model/types';
import { InlineEditCell } from '../InlineEditCell';
import { ConnectDialog } from './ConnectDialog';
import { endLabel, linksOfEquipment } from './endpoints';

const mine = (r: LinkEndRef, equipmentId: string) => (r.kind === 'equipment' || r.kind === 'circuit') && r.equipmentId === equipmentId;

/** 설비의 연결 탭 — 이 설비(와 그 회로)에 닿은 연결 목록과 「잇기」. */
export function LinkList({ equipmentId, substationId }: { equipmentId: string; substationId: string }) {
  const catalog = useCatalog().data;
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = { saved, overlays };
  const links = useMemo(() => linksOfEquipment({ saved, overlays }, equipmentId), [saved, overlays, equipmentId]);
  const cableName = (id: string | null) => (id ? catalog?.cableTypes.find((c) => c.id === id)?.name ?? '—' : '—');

  function relabel(l: Link, side: 'a' | 'b', raw: string) {
    const ref = l[side];
    if (ref.kind !== 'equipment') return;
    const label = raw.trim() || null;
    if (label === (ref.label ?? null)) return;
    workingCopyStore.getState().update('links', l.id, { [side]: { ...ref, label } });
  }
  function remove(id: string) {
    const r = deleteRows({ links: [id] });
    setError(r.blocked[0]?.reason ?? null);
  }

  return (
    <DetailCard>
      <DetailCardHeader title="연결" actions={<Button variant="secondary" size="sm" onClick={() => setOpen(true)}>잇기</Button>} />
      <ErrorStrip message={error} onDismiss={() => setError(null)} />
      {links.length === 0 && <EmptyState title="아직 연결이 없습니다" />}
      {links.map((l) => {
        const near: 'a' | 'b' = mine(l.a, equipmentId) ? 'a' : 'b';
        const far = near === 'a' ? l.b : l.a;
        const nearRef = l[near];
        return (
          <div key={l.id} className="group flex items-center gap-2 border-b border-line py-1 text-sm text-content">
            <span className="w-32 shrink-0 truncate">
              {nearRef.kind === 'equipment'
                ? <InlineEditCell value={nearRef.label ?? ''} label="표기" onCommit={(v) => relabel(l, near, v)} />
                : endLabel(s, nearRef)}
            </span>
            <span className="min-w-0 flex-1 truncate">{endLabel(s, far)}</span>
            <span className="shrink-0 text-xs text-content-muted">{cableName(l.cableTypeId)}</span>
            <span className="w-14 shrink-0 text-right text-xs text-content-muted">{l.lengthM != null ? `${l.lengthM} m` : '—'}</span>
            <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              <IconButton size="sm" tone="danger" aria-label="연결 지우기" onClick={() => remove(l.id)}><Trash2 className="h-3.5 w-3.5" /></IconButton>
            </span>
          </div>
        );
      })}
      <ConnectDialog substationId={substationId} from={{ kind: 'equipment', equipmentId }} open={open} onClose={() => setOpen(false)} onCreated={() => setError(null)} />
    </DetailCard>
  );
}
