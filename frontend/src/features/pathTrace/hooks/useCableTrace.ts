import { useQuery } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type { TraceResult } from '../types';

export function useCableTrace(cableId: string | null) {
  return useQuery({
    queryKey: ['cable-trace', cableId],
    queryFn: async () => {
      const { data } = await api.get<{ data: TraceResult }>(`/cables/${cableId}/trace`);
      return data.data;
    },
    enabled: !!cableId,
    staleTime: 30_000,
  });
}
