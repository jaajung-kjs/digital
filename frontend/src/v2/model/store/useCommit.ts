import { useQueryClient } from '@tanstack/react-query';
import { validateState, type ModelIssue } from '@twin/core';
import { isAxiosError } from 'axios';
import { useCallback, useMemo, useState } from 'react';
import { apiErrorMessage } from '../../apiError';
import { useV2Notice } from '../../store/noticeStore';
import { pendingPhotoFiles } from '../../store/pendingPhotos';
import { putCommit } from '../api';
import { NETWORK_KEY } from '../networkApi';
import { CATALOG_KEY, EQUIPMENT_CHANGES_KEY, NODE_EQUIPMENT_KEY, useCatalog } from '../hooks';
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
    /* 보내는 동안 다른 사용자가 들어왔으면(`claim` → `reset`) 저장 뒤 정리는 그 사람의 새 변경안에 하지 않는다. */
    const owner = s.owner;
    try {
      await putCommit(buildCommitPayload(s), pendingPhotoFiles());
      if (workingCopyStore.getState().owner !== owner) return;
      /* 서버에는 들어갔다. 변경안은 **새 기준이 들어오는 같은 set 에서** 비운다(`refresh`) — 먼저 비우면 그 틈에
         방금 만든 설비·랙이 저장본에도 오버레이에도 없어 상세 레일의 선택이 풀린다(`useLiveSelection`).
         다시 저장해 겹치는 일은 저장 중 잠금(`isCommitting`·`BusyOverlay`)이 막는다. */
      try {
        const gone = await s.refresh();
        if (gone.length > 0) useV2Notice.getState().showError(`삭제된 변전소를 목록에서 뺐습니다 — ${gone.join(' · ')}`);
      } catch {
        /* 새 기준을 못 읽었다 — 보낸 변경안은 비운다(다시 보내면 겹친다). */
        workingCopyStore.getState().clearOverlays();
        useV2Notice.getState().showError('저장했지만 새로 불러오지 못했습니다 — 새로고침(F5)하세요');
      }
      await qc.invalidateQueries({ queryKey: ['v2', 'org-tree'] });
      await qc.invalidateQueries({ queryKey: NODE_EQUIPMENT_KEY });
      await qc.invalidateQueries({ queryKey: CATALOG_KEY });
      await qc.invalidateQueries({ queryKey: EQUIPMENT_CHANGES_KEY });
      /* 광 계통도·중계경로의 범위 데이터 — 들르지 않은 국의 것도 저장으로 바뀌었을 수 있다(광선로 삭제가 먼 국 연결까지 지운다). */
      await qc.invalidateQueries({ queryKey: NETWORK_KEY });
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
    commit, isCommitting, conflicts, issues, error, ready, cableTypes,
    clearConflicts: useCallback(() => setConflicts(null), []),
    clearError: useCallback(() => setError(null), []),
  };
}
