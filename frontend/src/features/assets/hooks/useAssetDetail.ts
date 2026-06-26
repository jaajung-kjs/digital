import { useQuery } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import { isTempId } from '../../../utils/idHelpers';
import { useEffectiveAssets } from '../../workingCopy/hooks';
import { isFloorPlaced } from '../../workingCopy/floorAnchor';
import type { AssetDetailView } from '../components/detail/types';

type AssetDetailResponse = {
  id: string;
  name: string;
  manager?: string | null;
  description?: string | null;
  installDate?: string | null;
};

function useAssetDetail(assetId: string, enabled = true) {
  const isTemp = isTempId(assetId);
  return useQuery({
    queryKey: ['asset-detail', assetId],
    queryFn: async () => {
      const { data } = await api.get<{ data: AssetDetailResponse }>(`/assets/${assetId}`);
      return data.data;
    },
    // 랙 모듈 등 /assets 레코드가 없는 자산은 fetch 비활성(404 방지) — 호출부가 enabled=false.
    enabled: enabled && !!assetId && !isTemp,
  });
}

export function useMergedAssetDetail(assetId: string): {
  asset: AssetDetailView | null;
  isLoading: boolean;
  error: unknown;
} {
  const isTemp = isTempId(assetId);
  // SSOT-2d3a Task 5 — 통합 스토어 effective assets 에서 해당 설비를 찾아 매핑한다.
  const effectiveAssets = useEffectiveAssets();
  // /assets 레코드는 도면에 직접 배치된 설비만 존재한다. 미배치 자산(랙 모듈·회로 등)을
  // fetch 하면 404 → isFloorPlaced 로 게이팅(parentAssetId 휴리스틱이 아닌 동일한 원리 술어).
  // effective 에 아직 없으면(미상) fetch 허용 — 배치 설비가 로드 전일 수 있음.
  const selfAsset = effectiveAssets.find((a) => a.id === assetId);
  const fetchEnabled = !selfAsset || isFloorPlaced(selfAsset);
  const { data: backendData, isLoading, error } = useAssetDetail(assetId, fetchEnabled);

  const localEq = effectiveAssets.find((a) => a.id === assetId);
  if (!localEq) {
    return { asset: null, isLoading: isTemp ? false : isLoading, error };
  }

  const pick = <T,>(localVal: T | undefined | null, backendVal: T | undefined | null): T | null =>
    localVal !== undefined ? (localVal ?? null) : (backendVal ?? null);

  const asset: AssetDetailView = {
    id: localEq.id,
    name: localEq.name,
    manager: pick(localEq.manager, backendData?.manager),
    description: pick(localEq.description, backendData?.description),
    installDate: pick(localEq.installDate, backendData?.installDate),
    width2d: localEq.width2d ?? 0,
    height2d: localEq.height2d ?? 0,
  };
  return { asset, isLoading: isTemp ? false : isLoading, error: isTemp ? null : error };
}
