import type { Asset } from '../../types/asset';
import type { RackModule } from '../../types/rackModule';

/**
 * 에디터 랙모듈(RackModule) → 통합 스토어용 Asset(랙의 자식).
 *
 * 랙모듈은 별도 컬렉션이 아니라 ASSETS 컬렉션에 RACK 의 자식 Asset 으로 들어간다
 * (parentAssetId + slotIndex + slotSpan). 2b 의 commit 빌더가 parentAssetId+slotIndex
 * 로 assets → assets/rackModules 를 다시 분리한다. 따라서 여기서는 RackModule 을
 * 랙 자식 Asset 으로 정방향 매핑한다.
 *   rackEquipmentId → parentAssetId, categoryId → assetTypeId,
 *   properties.sourcePresetId → sourcePresetId(#7).
 * 배치 좌표(positionX/Y/width2d/height2d)와 totalU 는 랙모듈에 없어 null.
 */
export function rackModuleToAssetCreate(
  m: RackModule,
  ctx: { substationId: string; floorId: string | null; tempId: string },
): Asset {
  return {
    id: ctx.tempId,
    substationId: ctx.substationId,
    assetTypeId: m.categoryId,
    // staged create — 실제 assetType 은 서버 커밋 후에야 알 수 있다. 랙모듈은 배치형이 아니다.
    assetType: { placementKind: null } as Asset['assetType'],
    name: m.name,
    parentAssetId: m.rackEquipmentId,
    floorId: ctx.floorId,
    roomText: null,
    positionX: null,
    positionY: null,
    width2d: null,
    height2d: null,
    rotation: 0,
    totalU: null,
    slotIndex: m.slotIndex,
    slotSpan: m.slotSpan,
    description: m.description ?? null,
    manager: m.manager ?? null,
    installDate: m.installDate ?? null,
    status: null,
    warrantyUntil: null,
    replaceDue: null,
    sourcePresetId: (m.properties as { sourcePresetId?: string } | null | undefined)?.sourcePresetId ?? null,
    sortOrder: m.sortOrder ?? 0,
    updatedAt: '',
  };
}

export function rackModuleToAssetPatch(patch: Partial<RackModule>): Partial<Asset> {
  const p: Partial<Asset> = {};
  if ('rackEquipmentId' in patch) p.parentAssetId = patch.rackEquipmentId as string;
  if ('categoryId' in patch) p.assetTypeId = patch.categoryId as string;
  if ('name' in patch) p.name = patch.name as string;
  if ('slotIndex' in patch) p.slotIndex = patch.slotIndex ?? null;
  if ('slotSpan' in patch) p.slotSpan = patch.slotSpan ?? null;
  if ('installDate' in patch) p.installDate = patch.installDate ?? null;
  if ('manager' in patch) p.manager = patch.manager ?? null;
  if ('description' in patch) p.description = patch.description ?? null;
  if ('properties' in patch) {
    p.sourcePresetId = (patch.properties as { sourcePresetId?: string } | null | undefined)?.sourcePresetId ?? null;
  }
  return p;
}
