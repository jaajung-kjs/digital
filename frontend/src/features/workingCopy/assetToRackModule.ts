import type { Asset } from '../../types/asset';
import type { RackModule } from '../../types/rackModule';

/**
 * 통합 스토어의 랙 자식 Asset(parentAssetId + slotIndex) → 에디터/피커가 기대하는
 * RackModule shape 으로 역매핑한다. rackModuleToAsset 의 역방향.
 *
 * 카테고리 표시 필드(categoryName/Code/DisplayColor)는 Asset 에 join 된
 * assetType 에서 끌어온다 — `/workingcopy` 응답이 assetType 를 포함하므로 별도
 * 카테고리 쿼리 없이 채울 수 있다. categoryDefaultSlotSpan 은 Asset 에 없어
 * slotSpan 으로 fallback(쓰기 경로의 slotGeometry 헬퍼는 Task 4 에서 다룸).
 */
export function assetToRackModule(a: Asset): RackModule {
  return {
    id: a.id,
    rackEquipmentId: a.parentAssetId ?? '',
    categoryId: a.assetTypeId,
    categoryCode: a.assetType?.code ?? null,
    categoryName: a.assetType?.name ?? null,
    categoryDisplayColor: a.assetType?.displayColor ?? null,
    categoryDefaultSlotSpan: a.slotSpan ?? 1,
    name: a.name,
    slotIndex: a.slotIndex ?? 0,
    slotSpan: a.slotSpan ?? 1,
    installDate: a.installDate ?? null,
    manager: a.manager ?? null,
    description: a.description ?? null,
    // 프리셋 추적: 전용 컬럼 sourcePresetId → FE 캐리어 properties 로 재구성(#7).
    properties: a.sourcePresetId ? { sourcePresetId: a.sourcePresetId } : null,
    sortOrder: a.sortOrder ?? 0,
    createdAt: '',
    updatedAt: a.updatedAt ?? '',
  };
}
