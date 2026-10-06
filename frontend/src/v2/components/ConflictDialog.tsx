import { useState } from 'react';
import { Button, Modal } from '../../components/ui';
import { effectiveRows, equipmentName } from '../model/store/effective';
import { useWorkingCopy, workingCopyStore, type WorkingCopyState } from '../model/store/workingCopy';
import type { Conflict } from '../model/types';

interface ConflictDialogProps {
  conflicts: Conflict[];
  /** 서버 기준으로 새로고침한 뒤 불린다 — 충돌 표시를 걷는다. */
  onClose: () => void;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 충돌 키를 사람이 읽는 이름으로 — uuid 는 effective 행에서, 회로·코어는 자연 키에서. */
export function conflictLabel(s: Pick<WorkingCopyState, 'saved' | 'overlays'>, key: string): string {
  const [kind, owner, no] = key.split(':');
  if (kind === 'circuit' && owner && no) return `${equipmentName(s, owner) ?? owner.slice(0, 8)} 회로 ${no}`;
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

function ConflictItem({ conflict }: { conflict: Conflict }) {
  const label = useWorkingCopy((s) => conflictLabel(s, conflict.key));
  return (
    <li className="flex items-center gap-2 text-xs text-content">
      <span className="min-w-0 truncate font-mono text-content-faint">{label}</span>
      <span className="shrink-0 text-danger">{reasonLabel(conflict.reason)}</span>
    </li>
  );
}

export function ConflictDialog({ conflicts, onClose }: ConflictDialogProps) {
  const [reloading, setReloading] = useState(false);
  if (conflicts.length === 0) return null;

  async function handleRefresh() {
    setReloading(true);
    try {
      await workingCopyStore.getState().refresh();
      onClose();
    } finally {
      setReloading(false);
    }
  }

  /* 닫기는 「새로고침」 하나뿐이라 백드롭·Esc 로는 닫지 않는다(저장이 막힌 상태다). */
  return (
    <Modal
      open
      onClose={() => {}}
      title="저장 충돌"
      footer={
        <Button size="sm" disabled={reloading} onClick={() => void handleRefresh()}>
          {reloading ? '새로고침 중…' : '서버 기준으로 새로고침'}
        </Button>
      }
    >
      <p className="mb-3 text-xs text-content-muted">아래 항목이 서버와 충돌하여 저장되지 않았습니다.</p>
      <ul className="space-y-1">
        {conflicts.map((c) => (
          <ConflictItem key={c.key} conflict={c} />
        ))}
      </ul>
    </Modal>
  );
}
