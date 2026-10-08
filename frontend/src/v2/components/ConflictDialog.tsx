import { useState } from 'react';
import { Button, ErrorStrip, Modal } from '../../components/ui';
import { apiErrorMessage } from '../apiError';
import { effectiveRows, equipmentName } from '../model/store/effective';
import { useWorkingCopy, workingCopyStore, type DroppedEdit, type WorkingCopyState } from '../model/store/workingCopy';
import type { Conflict } from '../model/types';

interface ConflictDialogProps {
  conflicts: Conflict[];
  /** 상자를 닫는다 — 충돌 표시를 걷는다(버렸든 유지했든). */
  onClose: () => void;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 충돌 키를 사람이 읽는 이름으로 — uuid 는 effective 행에서, 차단기(모델의 회로)·코어는 자연 키에서. */
export function conflictLabel(s: Pick<WorkingCopyState, 'saved' | 'overlays'>, key: string): string {
  const [kind, owner, no] = key.split(':');
  if (kind === 'circuit' && owner && no) return `${equipmentName(s, owner) ?? owner.slice(0, 8)} 차단기 ${no}`;
  if (kind === 'core' && owner && no) {
    const line = effectiveRows(s, 'fiberLines').find((l) => l.id === owner);
    return `${line?.name ?? owner.slice(0, 8)} 코어 ${no}`;
  }
  if (UUID.test(key)) {
    const name =
      effectiveRows(s, 'racks').find((r) => r.id === key)?.name
      ?? effectiveRows(s, 'equipment').find((e) => e.id === key)?.name
      ?? effectiveRows(s, 'floors').find((f) => f.id === key)?.name
      ?? effectiveRows(s, 'fiberLines').find((l) => l.id === key)?.name;
    if (name) return name;
    if (effectiveRows(s, 'links').some((l) => l.id === key)) return '연결';
  }
  return key.slice(0, 8);
}

const reasonLabel = (reason: Conflict['reason']) => (reason === 'deleted' ? '서버에서 삭제됨' : '다른 사용자가 수정함');

const ORPHAN_LABEL: Partial<Record<DroppedEdit['kind'], string>> = {
  maintenance: '고장 이력', inspections: '점검 기록', photos: '사진', coreMeasurements: '측정',
};

/** 버린 손질 하나의 이름 — 버리기 **전** 상태로 짓는다(버린 뒤에는 그 행이 없을 수 있다). */
function droppedLabel(before: Pick<WorkingCopyState, 'saved' | 'overlays'>, d: DroppedEdit): string {
  if (d.reason === 'conflict') return conflictLabel(before, d.key);
  const kind = d.kind as 'maintenance' | 'inspections' | 'photos' | 'coreMeasurements';
  const row = before.overlays[kind].creates[d.key] as { equipmentId?: string; lineId?: string } | undefined;
  const owner = row?.equipmentId ? equipmentName(before, row.equipmentId)
    : row?.lineId ? effectiveRows(before, 'fiberLines').find((l) => l.id === row.lineId)?.name ?? null : null;
  return `${owner ? `${owner} ` : ''}${ORPHAN_LABEL[d.kind] ?? '항목'}(저장 안 됨)`;
}

function ConflictItem({ conflict }: { conflict: Conflict }) {
  const label = useWorkingCopy((s) => conflictLabel(s, conflict.key));
  return (
    <li className="flex items-center gap-2 text-sm text-content">
      <span className="min-w-0 truncate">{label}</span>
      <span className="shrink-0 text-xs text-danger">{reasonLabel(conflict.reason)}</span>
    </li>
  );
}

/**
 * 저장 충돌(409) — **충돌한 항목의 손질만 버리고 나머지 변경안은 남긴다**(`rebase`).
 *
 * 변경안은 여러 국에 걸친 공사 단위다. 국 A 의 랙 하나가 낡았다고 국 B·C 의 손질까지 통째로 버리면 안 된다.
 * 그래서 고르는 길은 둘이다: 「충돌 항목만 버리고 계속」(서버 기준을 새로 읽고 충돌 키만 걷는다) ·
 * 「변경 유지하고 닫기」(아무것도 바꾸지 않는다 — 다시 저장하면 같은 충돌이 난다). 버린 뒤에는 무엇을 버렸고
 * 몇 건이 남았는지 상자 안에 적는다(사라지는 알림으로 넘기지 않는다).
 */
export function ConflictDialog({ conflicts, onClose }: ConflictDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 버린 뒤 — 버린 것의 이름과 남은 변경 수. */
  const [result, setResult] = useState<{ dropped: string[]; remaining: number } | null>(null);
  if (conflicts.length === 0) return null;

  /* 다시 읽기가 실패하면 아무것도 바뀌지 않았다(오버레이는 그대로) — 상자 안에 까닭을 적고 같은 단추로 다시 해 본다. */
  async function handleDrop() {
    setBusy(true);
    setError(null);
    const st = workingCopyStore.getState();
    const before = { saved: st.saved, overlays: st.overlays };
    try {
      const dropped = await st.rebase(conflicts);
      setResult({ dropped: dropped.map((d) => droppedLabel(before, d)), remaining: workingCopyStore.getState().dirtyCount() });
    } catch (e) {
      setError(apiErrorMessage(e, '서버에서 새로 불러오지 못했습니다'));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <Modal open onClose={onClose} title="저장 충돌" footer={<Button size="sm" onClick={onClose}>확인</Button>}>
        <p className="mb-3 text-sm text-content">충돌한 항목 {result.dropped.length}건의 변경을 취소했습니다.</p>
        <ul className="mb-3 space-y-1" aria-label="취소한 변경">
          {result.dropped.map((label, i) => <li key={i} className="truncate text-sm text-content-muted">{label}</li>)}
        </ul>
        <p className="text-sm text-content">
          {result.remaining > 0
            ? `나머지 변경 ${result.remaining}건은 그대로입니다. 서버의 최신 값을 확인한 뒤 다시 저장하세요.`
            : '남은 변경이 없습니다.'}
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={() => { if (!busy) onClose(); }}
      title="저장 충돌"
      footer={
        <>
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>변경 유지하고 닫기</Button>
          <Button size="sm" disabled={busy} onClick={() => void handleDrop()}>
            {busy ? '불러오는 중…' : error ? '다시 시도' : '충돌 항목만 버리고 계속'}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-content">
        아래 {conflicts.length}건이 서버와 충돌하여 저장되지 않았습니다. 「충돌 항목만 버리고 계속」을 누르면 서버의 최신 값을 불러오고,
        이 {conflicts.length}건에 대한 내 변경만 취소합니다. 나머지 변경은 그대로 남습니다.
      </p>
      <ul className="space-y-1">
        {conflicts.map((c) => (
          <ConflictItem key={c.key} conflict={c} />
        ))}
      </ul>
      <ErrorStrip message={error} className="mt-3" />
    </Modal>
  );
}
