import { useQuery } from '@tanstack/react-query';
import { assetApi } from '../../../services/assetApi';

const ASSET_TYPE_KEYS = { all: ['asset-types'] as const };

export function useAssetTypes() {
  return useQuery({
    queryKey: ASSET_TYPE_KEYS.all,
    queryFn: () => assetApi.listTypes(),
    staleTime: 5 * 60 * 1000,
  });
}
