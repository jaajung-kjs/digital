import { useQueryClient } from '@tanstack/react-query';
import { validateState, type ModelIssue } from '@twin/core';
import { isAxiosError } from 'axios';
import { useCallback, useMemo, useState } from 'react';
import { apiErrorMessage } from '../../apiError';
import { useV2Notice } from '../../store/noticeStore';
import { pendingPhotoFiles } from '../../store/pendingPhotos';
import { putCommit } from '../api';
import { CATALOG_KEY, NODE_EQUIPMENT_KEY, useCatalog } from '../hooks';
import type { Conflict } from '../types';
import { buildCommitPayload } from './commitPayload';
import { toModelState } from './effective';
import { useWorkingCopy, workingCopyStore } from './workingCopy';

/**
 * 저장 — **서버에 보내기 전에 core 판정으로 미리 본다**(같은 규칙, 같은 함수). 흠이 있으면
 * 보내지 않고 흠을 돌려준다. 저장 뒤에는 들른 국을 모두 다시 읽어 버전을 맞춘다.
 */
export function useCommit() {
  const qc = useQueryClient();
  const catalog = useCatalog();
  const [isCommitting, setCommitting] = useState(false);
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  const cableTypes = catalog.data?.cableTypes ?? [];
  const issues: ModelIssue[] = useMemo(
    () => validateState(toModelState({ saved, overlays }, cableTypes)),
    [saved, overlays, cableTypes],
  );

  const commit = useCallback(async () => {
    const s = workingCopyStore.getState();
    const count = s.dirtyCount();
    if (count === 0) return;
    if (issues.length > 0) { setError(issues[0]!.message); return; }
    setCommitting(true);
    setError(null);
    try {
      await putCommit(buildCommitPayload(s), pendingPhotoFiles());
      await s.refresh();
      await qc.invalidateQueries({ queryKey: ['v2', 'org-tree'] });
      await qc.invalidateQueries({ queryKey: NODE_EQUIPMENT_KEY });
      await qc.invalidateQueries({ queryKey: CATALOG_KEY });
      useV2Notice.getState().showSuccess(`변경 ${count}건을 저장했습니다`);
    } catch (e) {
      if (isAxiosError(e) && e.response?.status === 409 && Array.isArray(e.response.data?.details)) {
        setConflicts(e.response.data.details as Conflict[]);
      } else {
        setError(apiErrorMessage(e, '저장에 실패했습니다'));
      }
    } finally {
      setCommitting(false);
    }
  }, [qc, issues]);

  return {
    commit, isCommitting, conflicts, issues, error,
    clearConflicts: useCallback(() => setConflicts(null), []),
    clearError: useCallback(() => setError(null), []),
  };
}
