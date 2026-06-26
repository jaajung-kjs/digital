import { useEffectiveAssets } from '../../workingCopy/hooks';
import type { AssetDetailView } from '../components/detail/types';

/**
 * 통합 워킹카피의 effective assets 에서 해당 자산을 찾아 표시용 뷰로 매핑한다(SSOT).
 *
 * 백엔드 fetch 는 두지 않는다 — 표시 필드(manager·description·installDate)는 워킹카피 Asset 에
 * 모두 존재하므로 `/api/assets/:id` 왕복은 불필요. (구 훅은 전면/후면 이미지 때문에 백엔드가
 * 필요했으나 그 필드들은 제거됨.) effective 에 없으면 null.
 */
export function useMergedAssetDetail(assetId: string): {
  asset: AssetDetailView | null;
  isLoading: boolean;
  error: unknown;
} {
  const effectiveAssets = useEffectiveAssets();
  const localEq = effectiveAssets.find((a) => a.id === assetId);
  if (!localEq) {
    return { asset: null, isLoading: false, error: null };
  }

  const asset: AssetDetailView = {
    id: localEq.id,
    name: localEq.name,
    manager: localEq.manager ?? null,
    description: localEq.description ?? null,
    installDate: localEq.installDate ?? null,
    width2d: localEq.width2d ?? 0,
    height2d: localEq.height2d ?? 0,
  };
  return { asset, isLoading: false, error: null };
}
