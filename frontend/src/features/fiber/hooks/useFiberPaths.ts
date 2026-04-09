import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type { FiberPathDetail, CreateFiberPathInput } from '../types';

const FIBER_PATH_KEYS = {
  all: ['fiber-paths'] as const,
  byOfd: (ofdId: string) => [...FIBER_PATH_KEYS.all, 'ofd', ofdId] as const,
  detail: (pathId: string) => [...FIBER_PATH_KEYS.all, 'detail', pathId] as const,
};

export function useFiberPaths(ofdId: string, enabled = true) {
  return useQuery({
    queryKey: FIBER_PATH_KEYS.byOfd(ofdId),
    queryFn: async () => {
      const { data } = await api.get<{ data: FiberPathDetail[] }>(
        `/equipment/${ofdId}/fiber-paths`
      );
      return data.data;
    },
    enabled: enabled && !!ofdId,
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
