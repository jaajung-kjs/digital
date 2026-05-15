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

export type DistributionScope = 'branch' | 'substation' | 'rack';

export interface DistributionItem {
  id: string;
  name: string;
  count: number;
  /** scope='rack' 일 때만. navigate /floors/{floorId}/plan?equipmentId={id} 용. */
  floorId?: string;
}

export interface CategoryDistribution {
  scope: DistributionScope;
  items: DistributionItem[];
}

/** 카테고리 클릭 시 한 단계 아래 분포 lazy fetch (categoryId 가 있을 때만). */
export function useCategoryDistribution(
  nodeType: StatsNodeType | null,
  nodeId: string | null,
  categoryId: string | null,
) {
  return useQuery({
    queryKey: ['stats', 'rack-modules', 'distribution', nodeType, nodeId, categoryId],
    queryFn: async () => {
      const { data } = await api.get<{ data: CategoryDistribution }>(
        '/stats/rack-modules/distribution',
        { params: { nodeType, nodeId, categoryId } },
      );
      return data.data;
    },
    enabled: !!nodeType && !!nodeId && !!categoryId,
    staleTime: 30_000,
  });
}
