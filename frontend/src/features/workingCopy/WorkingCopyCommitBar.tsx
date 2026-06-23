import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useSubstationWorkingCopy, revokeStagedPhotoUrls } from './substationStore';
import { useUnifiedDirty } from './hooks';
import { useCommitWorkingCopy, type Conflict } from './useCommitWorkingCopy';
import { useEditorStore } from '../editor/stores/editorStore';
import { ConflictDialog } from './ConflictDialog';
import { Button } from '../../components/ui';

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

export function WorkingCopyCommitBar() {
  const dirty = useUnifiedDirty();
  const commit = useCommitWorkingCopy();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);

  if (dirty === 0) return null;

  const onCommit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await commit();
      if (!result.ok) { setConflicts(result.conflicts); return; }
      // ok=true → 훅이 이미 재조정(load)했다. staged 로 만든 변전소/층의 temp id 가
      // URL(경로+쿼리)에 남아 있으면 real id 로 치환 — 안 하면 평면도가 temp id 로 404.
      // temp id 는 'temp-<uuid>' 고유 문자열이라 단순 문자열 치환이 안전(라우트 구조 비종속).
      if (result.idMaps) {
        const before = location.pathname + location.search;
        let after = before;
        for (const coll of Object.values(result.idMaps)) {
          for (const [tmp, real] of Object.entries(coll)) after = after.split(tmp).join(real);
        }
        if (after !== before) navigate(after, { replace: true });
      }
    } catch {
      window.alert('저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const onRevert = () => {
    // 통합 overlay 되돌리기 + 에디터 staged 배경 폐기. 사진 blob URL 은 revert(오버레이 비우기) 전에 해제.
    revokeStagedPhotoUrls(useSubstationWorkingCopy.getState().overlays);
    useSubstationWorkingCopy.getState().revert();
    useEditorStore.getState().clearPendingData();
  };

  return (
    <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-line bg-warning-bg text-sm">
      <span className="text-warning font-medium">저장 {dirty}건</span>
      <Button size="sm" onClick={onCommit} disabled={busy}>저장</Button>
      <Button size="sm" variant="secondary" onClick={onRevert} disabled={busy}>되돌리기</Button>
      {conflicts && (
        <ConflictDialog
          conflicts={conflicts}
          onClose={() => setConflicts(null)}
          onReloadLatest={async () => {
            // 최신 saved/baseVersions 만 재조정하고 staged 편집은 보존 → 재커밋 가능.
            const wc = useSubstationWorkingCopy.getState();
            // 변전소가 열려 있으면 그 변전소 saved/baseVersions 재조정. 조직(본부/지사/변전소/층)
            // base version 은 loadOrgTree 가 갱신 — org-only 충돌도 이 경로로 풀린다.
            if (wc.substationId) await wc.load(wc.substationId);
            await wc.loadOrgTree();
            // 엔티티 baseVersions 만으론 floor 섹션 409 가 풀리지 않는다 — 활성 층의
            // floorPlan 쿼리도 무효화해 baseFloorVersion 을 fresh updatedAt 으로 재동기화.
            const activeFloorId = useEditorStore.getState().activeFloorId;
            if (activeFloorId != null) {
              await queryClient.invalidateQueries({ queryKey: ['floorPlan', activeFloorId] });
            }
            setConflicts(null);
          }}
        />
      )}
    </div>
  );
}
