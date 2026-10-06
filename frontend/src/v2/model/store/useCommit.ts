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
const NO_ISSUES: ModelIssue[] = [];
const NO_CABLES: { id: string; medium: string }[] = [];

export function useCommit() {
  const qc = useQueryClient();
  const catalog = useCatalog();
  const [isCommitting, setCommitting] = useState(false);
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  const cableTypes = catalog.data?.cableTypes ?? NO_CABLES;
  /* 품목이 오기 전에는 매체 판정이 거짓 흠을 낸다 — 그동안은 판정하지 않고 저장도 막는다. */
  const ready = catalog.data !== undefined;
  const issues: ModelIssue[] = useMemo(
    () => (ready ? validateState(toModelState({ saved, overlays }, cableTypes)) : NO_ISSUES),
    [ready, saved, overlays, cableTypes],
  );

  const commit = useCallback(async () => {
    const s = workingCopyStore.getState();
    const count = s.dirtyCount();
    if (count === 0) return;
    if (!ready) { setError('품목을 불러오는 중입니다'); return; }
    if (issues.length > 0) { setError(issues[0]!.message); return; }
    setCommitting(true);
    setError(null);
    try {
      await putCommit(buildCommitPayload(s), pendingPhotoFiles());
      /* 서버에는 들어갔다 — 변경안을 먼저 비워야 다시 저장해 겹치지 않는다. */
      s.clearOverlays();
      try {
        await s.refresh();
      } catch {
        useV2Notice.getState().showError('저장했지만 새로 불러오지 못했습니다 — 국을 다시 여세요');
      }
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
  }, [qc, issues, ready]);

  return {
    commit, isCommitting, conflicts, issues, error, ready,
    clearConflicts: useCallback(() => setConflicts(null), []),
    clearError: useCallback(() => setError(null), []),
  };
}
