import { useMemo, useState } from 'react';
import { Pencil, Route, Trash2 } from 'lucide-react';
import {
  Button, CommitInput, isComposing, DetailCard, DetailCardHeader, ErrorStrip, IconButton, ListHeading, ListItemRow, useConfirm,
  EmptyRow, lengthText,
} from '../../../components/ui';
import { EditOnly } from '../../useCanEdit';
import { deleteConfirm } from '../deleteConfirm';
import { useCatalog } from '../../model/hooks';
import { deleteRows } from '../../model/store/deleteActions';
import { effectiveRows } from '../../model/store/effective';
import { useWorkingCopy, workingCopyStore } from '../../model/store/workingCopy';
import type { Link } from '../../model/types';
import { PathTraceDialog } from '../paths/PathTraceDialog';
import { ConnectDialog } from './ConnectDialog';
import { endLabel, linksOfEquipment, nearLabel, sidesOf } from './endpoints';

/**
 * 설비의 연결 탭 — 이 설비(와 그 차단기)에 닿은 연결 목록과 「연결」.
 *
 * 한 건 = 두 줄: 첫 줄 **상대 끝 이름**(이 줄만의 것이라 진하게), 둘째 줄 `이쪽: 차단기 3 · 케이블 · 12 m`.
 * 이쪽 설비 이름은 패널 머리에 이미 있으니 다시 적지 않는다. 없는 값(표기·케이블·길이)은 건너뛴다.
 *
 * 차단기가 있는 설비(분전반)는 **받는 쪽과 주는 쪽**이 한 목록에 섞이면 어느 것이 이 설비의 전원인지 줄마다
 * 둘째 줄을 읽어야 안다. 둘 다 있으면 갈래로 나눈다: 「전원 받는 곳」 = 이쪽 끝이 설비 자신인 연결,
 * 「부하」 = 이쪽 끝이 그 설비의 차단기인 연결. 한쪽뿐이면 나누지 않는다(머리 하나는 아무것도 가르지 않는다).
 */
export function LinkList({ equipmentId, substationId, onOpenPower }: {
  equipmentId: string; substationId: string;
  /** 「입력 전원」 묶음 머리의 「차단기 대장에서 보기」 — 차단기 대장의 이 설비 블록으로(기록을 남긴다). */
  onOpenPower?: () => void;
}) {
  const catalog = useCatalog().data;
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();
  /** 표기를 고치는 중인 연결. */
  const [editing, setEditing] = useState<string | null>(null);
  /** 중계경로를 추적하는 코어 끝 — 연결의 코어 쪽 끝. */
  const [tracing, setTracing] = useState<{ lineId: string; coreNo: number; side: 'A' | 'B' } | null>(null);
  const s = { saved, overlays };
  const links = useMemo(() => linksOfEquipment({ saved, overlays }, equipmentId), [saved, overlays, equipmentId]);
  const hasBreakers = useMemo(
    () => (effectiveRows({ saved, overlays }, 'equipment').find((e) => e.id === equipmentId)?.circuitCount ?? 0) > 0,
    [saved, overlays, equipmentId],
  );
  const groups = useMemo(() => {
    const feed = links.filter((l) => l[sidesOf(l, equipmentId).near].kind === 'equipment');
    const loads = links.filter((l) => l[sidesOf(l, equipmentId).near].kind === 'circuit');
    return hasBreakers && feed.length > 0 && loads.length > 0
      ? [{ title: '입력 전원', links: feed, power: true }, { title: '부하', links: loads, power: false }]
      : [{ title: null, links, power: false }];
  }, [links, hasBreakers, equipmentId]);
  const cableName = (id: string | null) => (id ? catalog?.cableTypes.find((c) => c.id === id)?.name ?? null : null);

  function relabel(l: Link, side: 'a' | 'b', raw: string) {
    const ref = l[side];
    if (ref.kind !== 'equipment') return;
    const label = raw.trim() || null;
    if (label === (ref.label ?? null)) return;
    workingCopyStore.getState().update('links', l.id, { [side]: { ...ref, label } });
  }
  /* 묻는다 — 상대 끝은 다른 설비라 그 설비 상세(또는 선번장)에서도 사라진다(선번장의 「연결 삭제」와 같은 확인). */
  async function remove(l: Link) {
    const { far } = sidesOf(l, equipmentId);
    if (!(await confirm(deleteConfirm('연결', endLabel(s, far))))) return;
    const r = deleteRows({ links: [l.id] });
    setError(r.blocked[0]?.reason ?? null);
  }

  return (
    <DetailCard>
      <DetailCardHeader title="연결" actions={<EditOnly><Button variant="secondary" size="sm" onClick={() => setOpen(true)}>연결 추가</Button></EditOnly>} />
      <ErrorStrip message={error} onDismiss={() => setError(null)} />
      {links.length === 0 && <EmptyRow>연결이 없습니다</EmptyRow>}
      {/* 줄들은 한 자식으로 묶는다 — 카드는 자식마다 여백을 주므로, 따로 두면 줄 사이가 벌어진다(CONVENTIONS §3 「카드 안 목록 줄」). */}
      {links.length > 0 && (
        <div>
          {groups.map((g) => (
            <section key={g.title ?? 'all'} aria-label={g.title ?? undefined}>
              {g.title && (
                <ListHeading action={g.power && onOpenPower ? <Button variant="link" size="xs" onClick={onOpenPower}>차단기 대장에서 보기</Button> : undefined}>
                  {g.title}
                </ListHeading>
              )}
              {g.links.map((l) => row(l))}
            </section>
          ))}
        </div>
      )}
      <ConnectDialog substationId={substationId} from={{ kind: 'equipment', equipmentId }} open={open} onClose={() => setOpen(false)} onCreated={() => setError(null)} />
      {confirmDialog}
      {tracing && <PathTraceDialog substationId={substationId} at={tracing} onClose={() => setTracing(null)} />}
    </DetailCard>
  );

  function row(l: Link) {
    const { near, far } = sidesOf(l, equipmentId);
    const nearRef = l[near];
    const here = nearLabel(nearRef);
    const meta = [here, cableName(l.cableTypeId), l.lengthM != null ? lengthText(l.lengthM) : null].filter(Boolean).join(' · ');
    const farText = endLabel(s, far);
    /* 코어 끝이 있는 연결(광선로 코어에 물린 것)만 중계경로가 있다 — 그 코어 끝에서 추적한다. */
    const core = far.kind === 'core' ? far : null;
    return (
      <ListItemRow
        key={l.id}
        meta={editing === l.id && nearRef.kind === 'equipment' ? (
          <CommitInput
            size="sm" autoFocus aria-label="포트" placeholder="포트(예 AC IN)" value={nearRef.label ?? ''}
            onCommit={(v) => relabel(l, near, v)}
            onBlur={() => setEditing(null)}
            onKeyDown={(e) => { if (e.key === 'Escape' && !isComposing(e)) setEditing(null); }}
          />
        ) : <span data-testid="link-near" title={meta}>{meta}</span>}
        actions={(
          <>
            {core && (
              <IconButton size="sm" aria-label="중계경로" title="중계경로" onClick={() => setTracing({ lineId: core.lineId, coreNo: core.no, side: core.side })}>
                <Route className="h-3.5 w-3.5" />
              </IconButton>
            )}
            <EditOnly>
              {nearRef.kind === 'equipment' && (
                <IconButton size="sm" aria-label="포트 수정" title="포트 수정" onClick={() => setEditing(l.id)}><Pencil className="h-3.5 w-3.5" /></IconButton>
              )}
              <IconButton size="sm" tone="danger" aria-label="연결 삭제" title="연결 삭제" onClick={() => void remove(l)}><Trash2 className="h-3.5 w-3.5" /></IconButton>
            </EditOnly>
          </>
        )}
      >
        <span data-testid="link-far" title={farText}>{farText}</span>
      </ListItemRow>
    );
  }
}
