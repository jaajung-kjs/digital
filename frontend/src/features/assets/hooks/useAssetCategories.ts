import { useQuery } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type { AssetCategory } from '../../../types/assetCategory';

export const ASSET_CATEGORY_KEYS = { all: ['asset-categories'] as const };

/** 자산 분류(사용자 정의) 목록. 백엔드: GET /api/asset-categories. */
export function useAssetCategories() {
  return useQuery({
    queryKey: ASSET_CATEGORY_KEYS.all,
    queryFn: async () => {
      const { data } = await api.get<{ data: AssetCategory[] }>('/asset-categories');
      return data.data;
    },
    staleTime: 1000 * 60 * 30,
  });
}
