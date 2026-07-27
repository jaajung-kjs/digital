import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useCallback, useState } from 'react';
import { putCommit } from '../api';
import type { V2Conflict } from '../types';
import { useV2WorkingCopy } from './workingCopyStore';

export function useCommit() {
  const queryClient = useQueryClient();
  const [isCommitting, setCommitting] = useState(false);
  const [conflicts, setConflicts] = useState<V2Conflict[] | null>(null);

  const commit = useCallback(async () => {
    const s = useV2WorkingCopy.getState();
    if (!s.substationId || s.dirtyCount() === 0) return;
    const recordAssetIds: Record<string, string> = Object.fromEntries([
      ...s.saved.maintenanceLogs.map((r) => [r.id, r.assetId]),
      ...s.saved.inspectionLogs.map((r) => [r.id, r.assetId]),
    ]);
    const { buildCommitPayload } = await import('./buildCommitPayload');
    const payload = buildCommitPayload(s.overlays, s.baseVersions, recordAssetIds);
    setCommitting(true);
    try {
      await putCommit(s.substationId, payload);
      await s.load(s.substationId); // baseVersion 갱신 (2A 계약)
      await queryClient.invalidateQueries({ queryKey: ['v2', 'node-assets'] });
    } catch (e) {
      if (isAxiosError(e) && e.response?.status === 409) {
        setConflicts((e.response.data?.details as V2Conflict[]) ?? []);
      } else {
        throw e;
      }
    } finally {
      setCommitting(false);
    }
  }, [queryClient]);

  const clearConflicts = useCallback(() => setConflicts(null), []);
  return { commit, isCommitting, conflicts, clearConflicts };
}
