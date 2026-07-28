import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useCallback, useState } from 'react';
import { putCommit } from '../api';
import type { V2Conflict } from '../types';
import { buildCommitPayload } from './buildCommitPayload';
import { useV2WorkingCopy } from './workingCopyStore';

export function useCommit() {
  const queryClient = useQueryClient();
  const [isCommitting, setCommitting] = useState(false);
  const [conflicts, setConflicts] = useState<V2Conflict[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const commit = useCallback(async () => {
    const s = useV2WorkingCopy.getState();
    if (!s.substationId || s.dirtyCount() === 0) return;
    setCommitting(true);
    setError(null);
    try {
      const recordAssetIds: Record<string, string> = Object.fromEntries([
        ...s.saved.maintenanceLogs.map((r) => [r.id, r.assetId]),
        ...s.saved.inspectionLogs.map((r) => [r.id, r.assetId]),
      ]);
      const payload = buildCommitPayload(s.overlays, s.baseVersions, recordAssetIds);
      await putCommit(s.substationId, payload);
      await s.load(s.substationId); // baseVersion 갱신 (2A 계약)
      await queryClient.invalidateQueries({ queryKey: ['v2', 'org-tree'] });
      await queryClient.invalidateQueries({ queryKey: ['v2', 'node-assets'] });
    } catch (e) {
      if (isAxiosError(e) && e.response?.status === 409) {
        const details = e.response.data?.details;
        if (Array.isArray(details)) setConflicts(details as V2Conflict[]);
        else {
          const names: unknown = e.response.data?.details?.ownerSubstationNames;
          if (Array.isArray(names) && names.length > 0) {
            setError(`연결된 케이블이 있습니다. ${names.join(', ')} 변전소에서 케이블을 먼저 삭제하세요.`);
          } else {
            setError(e.response.data?.message ?? '커밋이 충돌로 거절되었습니다');
          }
        }
      } else {
        setError(isAxiosError(e) ? (e.response?.data?.message ?? e.message) : String(e));
      }
    } finally {
      setCommitting(false);
    }
  }, [queryClient]);

  const clearConflicts = useCallback(() => setConflicts(null), []);
  const clearError = useCallback(() => setError(null), []);
  return { commit, isCommitting, conflicts, clearConflicts, error, clearError };
}
