import { useCatalogStore } from './catalogStore';
import { AssetCategoryForm } from './forms/AssetCategoryForm';
import { AssetTypeForm } from './forms/AssetTypeForm';
import { CableGroupForm } from './forms/CableGroupForm';
import { CableCategoryForm } from './forms/CableCategoryForm';
import { SectionEmpty } from '../assets/components/detail/SectionShell';

/**
 * 우 상세 패널 라우터 — segment + selectedAsset/selectedCable 로 알맞은 폼을 렌더.
 * 미선택 상태는 SectionEmpty "항목을 선택하세요." 로 빈 상태 표시.
 */
export function CatalogDetailPane({ segment }: { segment: 'asset' | 'cable' }) {
  const selectedAsset = useCatalogStore((s) => s.selectedAsset);
  const selectedCable = useCatalogStore((s) => s.selectedCable);

  if (segment === 'asset') {
    if (!selectedAsset) {
      return <SectionEmpty>항목을 선택하세요.</SectionEmpty>;
    }
    if (selectedAsset.kind === 'category') {
      return <AssetCategoryForm id={selectedAsset.id} />;
    }
    return <AssetTypeForm id={selectedAsset.id} />;
  }

  // segment === 'cable'
  if (!selectedCable) {
    return <SectionEmpty>항목을 선택하세요.</SectionEmpty>;
  }
  if (selectedCable.kind === 'group') {
    return <CableGroupForm id={selectedCable.id} />;
  }
  return <CableCategoryForm id={selectedCable.id} />;
}
