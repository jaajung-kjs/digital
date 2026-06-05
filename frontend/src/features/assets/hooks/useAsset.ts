import { useQuery } from '@tanstack/react-query';
import { assetApi } from '../../../services/assetApi';
import { isTempId } from '../../../utils/idHelpers';
import type { Asset } from '../../../types/asset';

export function useAsset(assetId: string | undefined) {
  return useQuery<Asset>({
    queryKey: ['asset', assetId],
    queryFn: () => assetApi.getById(assetId!),
    enabled: !!assetId && !isTempId(assetId),
    // 읽기전용 표시용. 레지스터 편집이 30s 내 반영 안 될 수 있음(허용 — 편집은 대장에서). 5b 후 개선.
    staleTime: 30_000,
  });
}
