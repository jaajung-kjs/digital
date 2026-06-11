import type { Asset, AssetType } from '@prisma/client';
import { sourcePresetToProperties } from './sourcePreset.js';

export type PlacementKind = 'RACK' | 'OFD' | 'DISTRIBUTION' | 'GROUNDING' | 'HVAC';

// AssetType.placementKind 는 'DIST' 약어를 쓰지만, 프론트 계약의 kind 는 'DISTRIBUTION'.
const PLACEMENT_TO_KIND: Record<string, PlacementKind> = {
  RACK: 'RACK', OFD: 'OFD', DIST: 'DISTRIBUTION', GROUNDING: 'GROUNDING', HVAC: 'HVAC',
};
const KIND_TO_PLACEMENT: Record<PlacementKind, string> = {
  RACK: 'RACK', OFD: 'OFD', DISTRIBUTION: 'DIST', GROUNDING: 'GROUNDING', HVAC: 'HVAC',
};

export function placementKindToKind(placementKind: string | null): PlacementKind | null {
  return placementKind ? PLACEMENT_TO_KIND[placementKind] ?? null : null;
}
export function kindToPlacementCode(kind: PlacementKind): string {
  return KIND_TO_PLACEMENT[kind];
}

type AssetWithType = Asset & { assetType: AssetType };

/** 배치된 top-level Asset → plan equipment DTO */
export function assetToPlanEquipment(a: AssetWithType) {
  return {
    id: a.id,
    kind: placementKindToKind(a.assetType.placementKind),
    name: a.name,
    positionX: a.positionX ?? 0,
    positionY: a.positionY ?? 0,
    width: a.width2d ?? 0,
    height: a.height2d ?? 0,
    rotation: a.rotation,
    totalU: a.totalU,
    description: a.description,
    manager: a.manager,
    installDate: a.installDate ? a.installDate.toISOString().slice(0, 10) : null,
    height3d: null as number | null,
    frontImageUrl: null as string | null,
    rearImageUrl: null as string | null,
    properties: sourcePresetToProperties(a.sourcePresetId),
  };
}

/** 랙 자식 Asset → rack-module DTO */
export function assetToRackModule(a: AssetWithType) {
  return {
    id: a.id,
    rackEquipmentId: a.parentAssetId!,
    categoryId: a.assetTypeId,
    categoryCode: a.assetType.code,
    categoryName: a.assetType.name,
    categoryDisplayColor: a.assetType.displayColor,
    categoryDefaultSlotSpan: a.assetType.defaultSlotSpan,
    name: a.name,
    slotIndex: a.slotIndex ?? 0,
    slotSpan: a.slotSpan ?? 1,
    installDate: a.installDate,
    manager: a.manager,
    description: a.description,
    properties: sourcePresetToProperties(a.sourcePresetId),
    sortOrder: a.sortOrder,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}
