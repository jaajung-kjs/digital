import type { Asset, AssetType } from '@prisma/client';
import { sourcePresetToProperties } from './sourcePreset.js';

type AssetWithType = Asset & { assetType: AssetType };

/** 배치된 top-level Asset → plan asset DTO */
export function assetToPlanAsset(a: AssetWithType) {
  return {
    id: a.id,
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
    rackAssetId: a.parentAssetId!,
    categoryId: a.assetTypeId,
    categoryName: a.assetType.name,
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
