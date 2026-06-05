import { useQuery } from '@tanstack/react-query';
import { assetApi } from '../../../services/assetApi';
import { isTempId } from '../../../utils/idHelpers';
import type { Asset } from '../../../types/asset';

export function useAsset(assetId: string | undefined) {
  return useQuery<Asset>({
    queryKey: ['asset', assetId],
    queryFn: () => assetApi.getById(assetId!),
    enabled: !!assetId && !isTempId(assetId),
    staleTime: 30_000,
  });
}
