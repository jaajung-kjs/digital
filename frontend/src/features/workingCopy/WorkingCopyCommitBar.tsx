import { useState } from 'react';
import { useSubstationWorkingCopy } from './substationStore';
import { useUnifiedDirty } from './hooks';
import { useCommitWorkingCopy, type Conflict } from './useCommitWorkingCopy';
import { useEditorStore } from '../editor/stores/editorStore';
import { ConflictDialog } from './ConflictDialog';

// ──────────────────────────────────────────────────────────────────────────
// USP Task 2 — 워크스페이스/에디터 단일 저장 바.
//
// 단일 dirty 신호(useUnifiedDirty: overlay + 사진/로그 큐 + floor 설정)와 단일
// 커밋(useCommitWorkingCopy: commitSubstation + floor 섹션 + 사진/로그 flush +
// 재조정)을 묶는다. 에디터 툴바의 "저장" 버튼·Ctrl+S 도 이 커밋 경로로 통합됐다.
//
// 409 충돌은 useCommitWorkingCopy 가 throw 하지 않고 { ok:false, conflicts } 로
// 표면화한다 → 기존 ConflictDialog 에 그대로 전달한다.
// ──────────────────────────────────────────────────────────────────────────

export function WorkingCopyCommitBar({ substationId }: { substationId: string }) {
  const dirty = useUnifiedDirty();
  const commit = useCommitWorkingCopy();
  const [busy, setBusy] = useState(false);
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);

  if (dirty === 0) return null;

  const onCommit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await commit();
      if (!result.ok) setConflicts(result.conflicts);
      // ok=true → 훅이 이미 재조정(load)했다. 추가 작업 없음.
    } catch {
      window.alert('저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const onRevert = () => {
    // 통합 overlay 되돌리기 + 에디터가 별도 큐로 가진 pending 사진/로그/스테이징 배경 폐기.
    useSubstationWorkingCopy.getState().revert();
    useEditorStore.getState().clearPendingData();
  };

  return (
    <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-amber-50 text-sm">
      <span className="text-amber-700">저장 {dirty}건</span>
      <button onClick={onCommit} disabled={busy} className="px-2 py-1 rounded bg-blue-600 text-white disabled:bg-gray-300">저장</button>
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
