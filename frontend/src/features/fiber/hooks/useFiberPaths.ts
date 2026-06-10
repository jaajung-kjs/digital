import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import { isTempId } from '../../../utils/idHelpers';
import type { FiberPathDetail, CreateFiberPathInput } from '../types';

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

export function useFiberPathDetail(pathId: string, enabled = true) {
  return useQuery({
    queryKey: FIBER_PATH_KEYS.detail(pathId),
    queryFn: async () => {
      const { data } = await api.get<{ data: FiberPathDetail }>(
        `/fiber-paths/${pathId}`
      );
      return data.data;
    },
    enabled: enabled && !!pathId,
  });
}

export function useCreateFiberPath() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateFiberPathInput) => {
      const { data } = await api.post<{ data: FiberPathDetail }>(
        '/fiber-paths',
        input
      );
      return data.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: FIBER_PATH_KEYS.byOfd(variables.ofdAId),
      });
      queryClient.invalidateQueries({
        queryKey: FIBER_PATH_KEYS.byOfd(variables.ofdBId),
      });
    },
  });
}

export function useDeleteFiberPath() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (pathId: string) => {
      await api.delete(`/fiber-paths/${pathId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FIBER_PATH_KEYS.all });
    },
  });
}
