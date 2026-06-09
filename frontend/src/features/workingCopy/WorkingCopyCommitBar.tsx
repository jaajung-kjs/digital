import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSubstationWorkingCopy } from './substationStore';
import { useWorkingCopyDirty } from './hooks';
import { commitSubstation } from './substationCommit';
import { ConflictDialog } from './ConflictDialog';

// ──────────────────────────────────────────────────────────────────────────
// SSOT-2c Task 2 — 워크스페이스 단일 커밋 바.
//
// 통합 working-copy store(2b) 하나에 묶인 모든 컬렉션(assets/cables/dist/fiber)의
// staged 변경을 한 번에 커밋/되돌리기 한다. dirty(전 컬렉션 합계)가 0 이면 숨김.
//
// 409 충돌 처리는 SubstationStatusView 와 동일한 방식:
//   axios 에러의 e.response.status === 409 → e.response.data.details
//   ({ id; name? }[]) 를 ConflictDialog 에 전달.
// commitSubstation 은 409 를 catch 하지 않고 그대로 throw 하므로 raw axios
// 에러 shape 로 검출한다.
// ──────────────────────────────────────────────────────────────────────────

type Conflict = { id: string; name?: string };

/** axios 409 에러에서 충돌 목록(details)을 추출. 409 가 아니면 null. */
function extractConflicts(e: unknown): Conflict[] | null {
  const resp = (e as { response?: { status?: number; data?: { details?: Conflict[] } } }).response;
  if (resp?.status === 409) return resp.data?.details ?? [];
  return null;
}

export function WorkingCopyCommitBar({ substationId }: { substationId: string }) {
  const dirty = useWorkingCopyDirty();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);

  if (dirty === 0) return null;

  const onCommit = async () => {
    if (busy) return;
    setBusy(true);
    const s = useSubstationWorkingCopy.getState();
    try {
      await commitSubstation(substationId, s.overlays, s.saved.assets, queryClient);
      // 재조정: saved 새로고침 + overlay/history 클리어(2b load).
      await useSubstationWorkingCopy.getState().load(substationId);
    } catch (e: unknown) {
      const conf = extractConflicts(e);
      if (conf) setConflicts(conf);
      else window.alert('커밋에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const onRevert = () => useSubstationWorkingCopy.getState().revert();

  return (
    <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-amber-50 text-sm">
      <span className="text-amber-700">미커밋 {dirty}건</span>
      <button onClick={onCommit} disabled={busy} className="px-2 py-1 rounded bg-blue-600 text-white disabled:bg-gray-300">커밋</button>
      <button onClick={onRevert} disabled={busy} className="px-2 py-1 rounded bg-gray-100 disabled:opacity-50">되돌리기</button>
      {conflicts && (
        <ConflictDialog
          conflicts={conflicts}
          onClose={() => setConflicts(null)}
          onReloadLatest={async () => {
            // 최신 saved/baseVersions 만 재조정하고 staged 편집은 보존 → 재커밋 가능.
            await useSubstationWorkingCopy.getState().refreshBaseVersions(substationId);
            setConflicts(null);
          }}
        />
      )}
    </div>
  );
}
