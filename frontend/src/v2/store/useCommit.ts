import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useCallback, useState } from 'react';
import { putCommit } from '../api';
import { apiErrorMessage } from '../apiError';
import type { V2Conflict } from '../types';
import { buildCommitPayload } from './buildCommitPayload';
import { useV2Notice } from './noticeStore';
import { pendingPhotoFiles } from './pendingPhotos';
import { useV2WorkingCopy } from './workingCopyStore';

export function useCommit() {
  const queryClient = useQueryClient();
  const [isCommitting, setCommitting] = useState(false);
  const [conflicts, setConflicts] = useState<V2Conflict[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const commit = useCallback(async () => {
    const s = useV2WorkingCopy.getState();
    if (!s.substationId || s.dirtyCount() === 0) return;
    const pendingCount = s.dirtyCount();
    setCommitting(true);
    setError(null);
    try {
      const recordAssetIds: Record<string, string> = Object.fromEntries([
        ...s.saved.maintenanceLogs.map((r) => [r.id, r.assetId]),
        ...s.saved.inspectionLogs.map((r) => [r.id, r.assetId]),
        ...s.saved.photos.map((r) => [r.id, r.assetId]),
      ]);
      const payload = buildCommitPayload(s.overlays, s.baseVersions, recordAssetIds);
      /* 아직 서버에 없는 사진의 **파일도 이 요청에 실린다** — 저장이 서버로 보내는 유일한
         순간이라는 규칙을 사진만 빠져나가지 않게 한다. */
      await putCommit(s.substationId, payload, pendingPhotoFiles());
      await s.load(s.substationId); // baseVersion 갱신 (2A 계약)
      await queryClient.invalidateQueries({ queryKey: ['v2', 'org-tree'] });
      await queryClient.invalidateQueries({ queryKey: ['v2', 'node-assets'] });
      // 저장 바가 사라지는 것만으로는 "정말 저장됐나" 를 알 수 없다.
      useV2Notice.getState().showSuccess(`변경 ${pendingCount}건을 저장했습니다`);
    } catch (e) {
      if (isAxiosError(e) && e.response?.status === 409) {
        const details = e.response.data?.details;
        if (Array.isArray(details)) setConflicts(details as V2Conflict[]);
        else {
          const names: unknown = e.response.data?.details?.ownerSubstationNames;
          if (Array.isArray(names) && names.length > 0) {
            setError(`연결된 케이블이 있습니다. ${names.join(', ')} 변전소에서 케이블을 먼저 삭제하세요.`);
          } else {
            setError(apiErrorMessage(e, '커밋이 충돌로 거절되었습니다'));
          }
        }
      } else {
        // 폴백도 한글 고정 문구 — axios 의 raw 영문 메시지(Network Error 등) 누출 금지
        setError(apiErrorMessage(e, '저장에 실패했습니다'));
      }
    } finally {
      setCommitting(false);
    }
  }, [queryClient]);

  const clearConflicts = useCallback(() => setConflicts(null), []);
  const clearError = useCallback(() => setError(null), []);
  return { commit, isCommitting, conflicts, clearConflicts, error, clearError };
}
