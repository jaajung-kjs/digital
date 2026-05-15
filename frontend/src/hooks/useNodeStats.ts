import { useQuery } from '@tanstack/react-query';
import { api } from '../utils/api';

export type StatsNodeType = 'headquarters' | 'branch' | 'substation';

export interface CategoryCount {
  categoryId: string;
  code: string;
  name: string;
  displayColor: string | null;
  count: number;
}

export interface NodeStats {
  self: { total: number; byCategory: CategoryCount[] };
  children: { id: string; total: number }[];
}

export const NODE_STATS_KEY = (nodeType: StatsNodeType, nodeId: string) =>
  ['stats', 'rack-modules', nodeType, nodeId] as const;

/** 조직 노드 (본부/지사/변전소) 의 RackModule 합계 + 카테고리 breakdown + 자식 합계. */
export function useNodeStats(nodeType: StatsNodeType | null, nodeId: string | null) {
  return useQuery({
    queryKey: nodeType && nodeId ? NODE_STATS_KEY(nodeType, nodeId) : ['stats', 'rack-modules', 'idle'],
    queryFn: async () => {
      const { data } = await api.get<{ data: NodeStats }>('/stats/rack-modules', {
        params: { nodeType, nodeId },
      });
      return data.data;
    },
    enabled: !!nodeType && !!nodeId,
    staleTime: 30_000,
  });
}
