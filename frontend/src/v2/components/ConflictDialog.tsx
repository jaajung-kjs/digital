import { useState } from 'react';
import { Button } from '../../components/ui';
import type { V2Conflict } from '../types';
import { useV2WorkingCopy } from '../store/workingCopyStore';

interface ConflictDialogProps {
  conflicts: V2Conflict[];
  substationId: string;
  onClear: () => void;
}

export function ConflictDialog({ conflicts, substationId, onClear }: ConflictDialogProps) {
  const [reloading, setReloading] = useState(false);

  if (conflicts.length === 0) return null;

  async function handleRefresh() {
    setReloading(true);
    try {
      await useV2WorkingCopy.getState().load(substationId);
      onClear();
    } finally {
      setReloading(false);
    }
  }

  const reasonLabel = (reason: V2Conflict['reason']) =>
    reason === 'deleted' ? '서버에서 삭제됨' :
    reason === 'exists' ? '이미 존재하는 자산(재시도 중복)' :
    '다른 사용자가 수정함';

  return (
    <div className="fixed inset-0 z-alert flex items-center justify-center bg-[var(--overlay)]">
      <div className="mx-4 w-full max-w-md rounded-lg border border-line bg-surface p-5 shadow-lg">
        <h2 className="text-sm font-semibold text-content mb-1">저장 충돌</h2>
        <p className="text-xs text-content-muted mb-3">
          아래 자산이 서버와 충돌하여 저장되지 않았습니다.
        </p>
        <ul className="mb-4 space-y-1">
          {conflicts.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-xs text-content">
              <span className="font-mono text-content-faint truncate">{c.id}</span>
              <span className="shrink-0 text-danger">{reasonLabel(c.reason)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <Button size="sm" disabled={reloading} onClick={() => void handleRefresh()}>
            {reloading ? '새로고침 중…' : '서버 기준으로 새로고침'}
          </Button>
        </div>
      </div>
    </div>
  );
}
