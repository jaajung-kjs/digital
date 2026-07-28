import { assetReportItem, cableReportItem } from '@twin/core';
import type { ReportItem } from '@twin/core';
import type { V2Asset, V2AssetType, V2Cable, V2CableGroup, V2InspectionLog, V2MaintenanceLog } from './types';
import type { Overlay } from './store/overlay';

/** 스토어 Overlays의 구조적 타입 (import 없이 인라인) */
interface Overlays {
  assets: Overlay<V2Asset>;
  cables: Overlay<V2Cable>;
  maintenance: Overlay<V2MaintenanceLog>;
  inspections: Overlay<V2InspectionLog>;
}

/** '종류 미지정' 케이블 항목 — categoryId 없거나 group 미해소 시 공량 0 폴백 (M-1: 단일 출처) */
function unresolvedCableItem(kind: 'cable-install' | 'cable-remove', name: string): ReportItem {
  return {
    kind,
    name,
    typeName: '—',
    laborType: null,
    qty: 0,
    unit: 'm',
    hours: 0,
    note: '종류 미지정',
  };
}

const PLACEMENT_FIELDS = new Set<string>([
  'floorId', 'x', 'y', 'width', 'height',
  'parentAssetId', 'containerKey', 'slotIndex', 'slotSpan',
]);

export function buildReportItems(args: {
  saved: { assets: V2Asset[]; cables: V2Cable[] };
  overlays: Overlays;
  types: V2AssetType[];
  cableGroups: V2CableGroup[];
}): ReportItem[] {
  const { saved, overlays, types, cableGroups } = args;

  const typesById = new Map(types.map((t) => [t.id, t]));

  // categoryId → group 매핑 (categories를 flatten)
  const groupByCategoryId = new Map<string, V2CableGroup>();
  for (const g of cableGroups) {
    for (const cat of g.categories) {
      groupByCategoryId.set(cat.id, g);
    }
  }

  const savedAssetsById = new Map(saved.assets.map((a) => [a.id, a]));
  const savedCablesById = new Map(saved.cables.map((c) => [c.id, c]));

  // effective assets: saved + creates — deletes — updates (for cable name resolution)
  const effectiveAssetsById = new Map<string, V2Asset>(savedAssetsById);
  for (const [id, patch] of Object.entries(overlays.assets.updates)) {
    const base = effectiveAssetsById.get(id);
    if (base) effectiveAssetsById.set(id, { ...base, ...patch });
  }
  for (const id of overlays.assets.deletes) effectiveAssetsById.delete(id);
  for (const [id, asset] of Object.entries(overlays.assets.creates)) {
    effectiveAssetsById.set(id, asset as V2Asset);
  }

  // portId → assetName 매핑 (effective)
  const assetNameByPortId = new Map<string, string>();
  for (const asset of effectiveAssetsById.values()) {
    for (const port of asset.ports) {
      assetNameByPortId.set(port.id, asset.name);
    }
  }

  const items: ReportItem[] = [];

  // --- assets.creates → asset-install ---
  for (const asset of Object.values(overlays.assets.creates) as V2Asset[]) {
    const t = typesById.get(asset.typeId);
    if (!t) continue;
    items.push(assetReportItem('asset-install', asset.name, t.name, {
      laborType: t.laborType,
      installHours: t.installHours,
      removeHours: t.removeHours,
      relocateHours: t.relocateHours,
    }));
  }

  // --- assets.deletes → asset-remove (saved에서 해소) ---
  for (const id of overlays.assets.deletes) {
    const asset = savedAssetsById.get(id);
    if (!asset) continue; // temp 소거는 creates에서 처리되며 deletes에 안 남음
    const t = typesById.get(asset.typeId);
    if (!t) continue;
    items.push(assetReportItem('asset-remove', asset.name, t.name, {
      laborType: t.laborType,
      installHours: t.installHours,
      removeHours: t.removeHours,
      relocateHours: t.relocateHours,
    }));
  }

  // --- assets.updates → 배치 필드 존재 시 asset-relocate 1건 ---
  for (const [id, patch] of Object.entries(overlays.assets.updates)) {
    const hasBatchField = Object.keys(patch).some((k) => PLACEMENT_FIELDS.has(k));
    if (!hasBatchField) continue;
    const asset = savedAssetsById.get(id);
    if (!asset) continue;
    const t = typesById.get(asset.typeId);
    if (!t) continue;
    items.push(assetReportItem('asset-relocate', asset.name, t.name, {
      laborType: t.laborType,
      installHours: t.installHours,
      removeHours: t.removeHours,
      relocateHours: t.relocateHours,
    }));
  }

  // --- cables.creates → cable-install ---
  for (const cable of Object.values(overlays.cables.creates) as V2Cable[]) {
    // categoryId 없거나 group 미해소면 '종류 미지정' 공량 0
    if (!cable.categoryId) {
      items.push(unresolvedCableItem('cable-install', '케이블'));
      continue;
    }
    const group = groupByCategoryId.get(cable.categoryId);
    if (!group) {
      items.push(unresolvedCableItem('cable-install', '케이블'));
      continue;
    }
    // 이름 = "자산A↔자산B" (effective assets에서 포트 소유 해소)
    const aName = assetNameByPortId.get(cable.aPortId);
    const bName = assetNameByPortId.get(cable.bPortId);
    const name = aName && bName ? `${aName}↔${bName}` : '케이블';
    const lengthM = typeof (cable.specParams as Record<string, unknown>).lengthM === 'number'
      ? (cable.specParams as Record<string, unknown>).lengthM as number
      : null;
    items.push(cableReportItem('cable-install', name, {
      name: group.name,
      laborType: group.laborType,
      installHoursPerM: group.installHoursPerM,
      removeHoursPerM: group.removeHoursPerM,
    }, lengthM));
  }

  // --- cables.deletes → cable-remove (saved에서 해소) ---
  for (const id of overlays.cables.deletes) {
    const cable = savedCablesById.get(id);
    if (!cable) continue;
    if (!cable.categoryId) {
      items.push(unresolvedCableItem('cable-remove', cable.name ?? '케이블'));
      continue;
    }
    const group = groupByCategoryId.get(cable.categoryId);
    if (!group) {
      items.push(unresolvedCableItem('cable-remove', cable.name ?? '케이블'));
      continue;
    }
    // saved cables에서 refs 이름 해소
    const aName = cable.aRef?.assetName ?? assetNameByPortId.get(cable.aPortId);
    const bName = cable.bRef?.assetName ?? assetNameByPortId.get(cable.bPortId);
    const name = cable.name ?? (aName && bName ? `${aName}↔${bName}` : '케이블');
    const lengthM = typeof (cable.specParams as Record<string, unknown>).lengthM === 'number'
      ? (cable.specParams as Record<string, unknown>).lengthM as number
      : null;
    items.push(cableReportItem('cable-remove', name, {
      name: group.name,
      laborType: group.laborType,
      installHoursPerM: group.installHoursPerM,
      removeHoursPerM: group.removeHoursPerM,
    }, lengthM));
  }

  return items;
}
