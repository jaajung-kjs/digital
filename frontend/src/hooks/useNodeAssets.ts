import { useQuery } from '@tanstack/react-query';
import { api } from '../utils/api';
import type { AssetListItem } from '../features/assets/nodeStatus';

export type NodeKind = 'headquarters' | 'branch' | 'substation';

export function useNodeAssets(nodeType: NodeKind | null, nodeId: string | null) {
  return useQuery({
    queryKey: ['nodeAssets', nodeType, nodeId],
    queryFn: async () => {
      const { data } = await api.get<{ data: AssetListItem[] }>(`/nodes/${nodeId}/assets`, { params: { nodeType } });
      return data.data;
    },
    enabled: !!nodeType && !!nodeId,
  });
}
