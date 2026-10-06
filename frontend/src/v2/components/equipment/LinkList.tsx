import { useMemo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button, CommitInput, DetailCard, DetailCardHeader, EmptyState, ErrorStrip, IconButton, ListItemRow } from '../../../components/ui';
import { useCatalog } from '../../model/hooks';
import { deleteRows } from '../../model/store/deleteActions';
import { useWorkingCopy, workingCopyStore } from '../../model/store/workingCopy';
import type { Link } from '../../model/types';
import { ConnectDialog } from './ConnectDialog';
import { endLabel, linksOfEquipment, nearLabel, sidesOf } from './endpoints';

/**
 * 설비의 연결 탭 — 이 설비(와 그 차단기)에 닿은 연결 목록과 「잇기」.
 *
 * 한 건 = 두 줄: 첫 줄 **상대 끝 이름**(이 줄만의 것이라 진하게), 둘째 줄 `이쪽: 차단기 3 · 케이블 · 12 m`.
 * 이쪽 설비 이름은 패널 머리에 이미 있으니 다시 적지 않는다. 없는 값(표기·케이블·길이)은 건너뛴다.
 */
export function LinkList({ equipmentId, substationId }: { equipmentId: string; substationId: string }) {
  const catalog = useCatalog().data;
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 표기를 고치는 중인 연결. */
  const [editing, setEditing] = useState<string | null>(null);
  const s = { saved, overlays };
  const links = useMemo(() => linksOfEquipment({ saved, overlays }, equipmentId), [saved, overlays, equipmentId]);
  const cableName = (id: string | null) => (id ? catalog?.cableTypes.find((c) => c.id === id)?.name ?? null : null);

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
        const { near, far } = sidesOf(l, equipmentId);
        const nearRef = l[near];
        const here = nearLabel(nearRef);
        const meta = [here && `이쪽: ${here}`, cableName(l.cableTypeId), l.lengthM != null ? `${l.lengthM} m` : null].filter(Boolean).join(' · ');
        const farText = endLabel(s, far);
        return (
          <ListItemRow
            key={l.id}
            meta={editing === l.id && nearRef.kind === 'equipment' ? (
              <CommitInput
                size="sm" autoFocus aria-label="이쪽 표기" placeholder="표기(예 AC IN)" value={nearRef.label ?? ''}
                onCommit={(v) => relabel(l, near, v)}
                onBlur={() => setEditing(null)}
                onKeyDown={(e) => { if (e.key === 'Escape') setEditing(null); }}
              />
            ) : <span data-testid="link-near" title={meta}>{meta}</span>}
            actions={(
              <>
                {nearRef.kind === 'equipment' && (
                  <IconButton size="sm" aria-label="표기 고치기" title="이쪽 표기 고치기" onClick={() => setEditing(l.id)}><Pencil className="h-3.5 w-3.5" /></IconButton>
                )}
                <IconButton size="sm" tone="danger" aria-label="연결 지우기" title="연결 지우기" onClick={() => remove(l.id)}><Trash2 className="h-3.5 w-3.5" /></IconButton>
              </>
            )}
          >
            <span data-testid="link-far" title={farText}>{farText}</span>
          </ListItemRow>
        );
      })}
      <ConnectDialog substationId={substationId} from={{ kind: 'equipment', equipmentId }} open={open} onClose={() => setOpen(false)} onCreated={() => setError(null)} />
    </DetailCard>
  );
}
