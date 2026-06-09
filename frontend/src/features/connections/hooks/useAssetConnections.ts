import { useQuery } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type { CableDetailDTO } from '../types';

export function useAssetConnections(assetId: string | undefined) {
  return useQuery<CableDetailDTO[]>({
    queryKey: ['asset-connections', assetId],
    queryFn: async () => (await api.get<{ data: CableDetailDTO[] }>(`/assets/${assetId}/connections`)).data.data,
    enabled: !!assetId && !assetId.startsWith('temp-'),
    staleTime: 15_000,
  });
}
