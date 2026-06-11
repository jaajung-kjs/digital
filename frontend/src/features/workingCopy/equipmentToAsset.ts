import type { Asset } from '../../types/asset';
import type { FloorPlanEquipment } from '../../types/floorPlan';

/**
 * 캔버스 편집 결과(FloorPlanEquipment) → 통합 스토어용 Asset.
 *
 * assetToEquipment (2b, FORWARD) 의 정확한 역(REVERSE) 매핑이다.
 *   width2d ↔ width, height2d ↔ height, sourcePresetId ↔ properties.sourcePresetId(#7),
 *   positionX/Y 동일, rotation/totalU/description/manager/installDate 동일.
 * placementKind 는 FORWARD 에서 EquipmentKind 로 정규화되므로(예: DIST→DISTRIBUTION)
 * 역매핑에서는 복원하지 않는다 — staged Asset 의 assetType 은 클라이언트가 알 수 없다.
 *
 * deprecated FloorPlanEquipment 필드(model, manufacturer, materialCategory, specification 등)는
 * Asset 에 대응이 없어 의도적으로 DROP 한다.
 */
export function equipmentToAssetCreate(
  eq: FloorPlanEquipment,
  ctx: { substationId: string; floorId: string | null; assetTypeId: string; tempId: string },
): Asset {
  return {
    id: ctx.tempId,
    substationId: ctx.substationId,
    assetTypeId: ctx.assetTypeId,
    // staged create — 실제 assetType 은 서버 커밋 후에야 알 수 있다.
    // 캔버스/리스트 표시는 eq.kind 로 처리하므로 placementKind 만 최소 채운다.
    assetType: { placementKind: eq.kind } as Asset['assetType'],
    name: eq.name,
    parentAssetId: null,
    floorId: ctx.floorId,
    roomText: null,
    positionX: eq.positionX,
    positionY: eq.positionY,
    width2d: eq.width,
    height2d: eq.height,
    rotation: eq.rotation ?? 0,
    totalU: eq.totalU ?? null,
    slotIndex: null,
    slotSpan: null,
    description: eq.description ?? null,
    manager: eq.manager ?? null,
    installDate: eq.installDate ?? null,
    status: null,
    warrantyUntil: null,
    replaceDue: null,
    // 랙 프리셋 추적: FE 캐리어 properties.sourcePresetId → Asset 전용 컬럼(#7).
    sourcePresetId: (eq.properties as { sourcePresetId?: string } | null | undefined)?.sourcePresetId ?? null,
    sortOrder: 0,
    updatedAt: '',
  };
}

export function equipmentToAssetPatch(patch: Partial<FloorPlanEquipment>): Partial<Asset> {
  const p: Partial<Asset> = {};
  if ('name' in patch) p.name = patch.name as string;
  if ('positionX' in patch) p.positionX = patch.positionX ?? null;
  if ('positionY' in patch) p.positionY = patch.positionY ?? null;
  if ('width' in patch) p.width2d = patch.width ?? null;
  if ('height' in patch) p.height2d = patch.height ?? null;
  if ('rotation' in patch) p.rotation = patch.rotation ?? null;
  if ('totalU' in patch) p.totalU = patch.totalU ?? null;
  if ('description' in patch) p.description = patch.description ?? null;
  if ('manager' in patch) p.manager = patch.manager ?? null;
  if ('installDate' in patch) p.installDate = patch.installDate ?? null;
  if ('properties' in patch) {
    p.sourcePresetId = (patch.properties as { sourcePresetId?: string } | null | undefined)?.sourcePresetId ?? null;
  }
  return p;
}
