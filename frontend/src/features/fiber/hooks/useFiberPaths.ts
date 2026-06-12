import { useQuery, type QueryClient } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import { isTempId } from '../../../utils/idHelpers';
import type { FiberPathDetail } from '../types';

const FIBER_PATH_KEYS = {
  all: ['fiber-paths'] as const,
  byOfd: (ofdId: string) => [...FIBER_PATH_KEYS.all, 'ofd', ofdId] as const,
  detail: (pathId: string) => [...FIBER_PATH_KEYS.all, 'detail', pathId] as const,
};

/**
 * 전체 fiber path(GET /fiber-paths) 를 React Query 캐시로 가져온다(cross-substation).
 * 토폴로지/트레이서 등 React 컴포넌트 밖 소비처용 — queryKey ['fiber-paths'] 캐시 공유.
 */
export function fetchAllFiberPathsCached(qc: QueryClient): Promise<FiberPathDetail[]> {
  return qc.fetchQuery({
    queryKey: FIBER_PATH_KEYS.all,
    queryFn: async () => {
      const { data } = await api.get<{ data: FiberPathDetail[] }>('/fiber-paths');
      return data.data;
    },
    staleTime: 30_000,
  });
}

export function useFiberPaths(ofdId: string, enabled = true) {
  return useQuery({
    queryKey: FIBER_PATH_KEYS.byOfd(ofdId),
    queryFn: async () => {
      const { data } = await api.get<{ data: FiberPathDetail[] }>(
        `/equipment/${ofdId}/fiber-paths`
      );
      return data.data;
    },
    enabled: enabled && !!ofdId && !isTempId(ofdId),
  });
}

// fiber path 생성/삭제는 워킹카피 staging(substationStore.stageFiberPathCreate/Delete)으로만.
// 즉시 CRUD(useCreateFiberPath/useDeleteFiberPath)는 C2 위반 + 미사용이라 제거함.
