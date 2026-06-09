import { useQuery } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type { CableDetailDTO } from '../types';

export function useSubstationConnections(substationId: string | undefined) {
  return useQuery<CableDetailDTO[]>({
    queryKey: ['substation-connections', substationId],
    queryFn: async () => (await api.get<{ data: CableDetailDTO[] }>(`/substations/${substationId}/connections`)).data.data,
    enabled: !!substationId,
    staleTime: 15_000,
  });
}
