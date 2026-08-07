import { assetReportItem, cableReportItem, COMMON_CABLE_FIELDS, PLACEMENT_FIELDS } from '@twin/core';
import type { ReportItem } from '@twin/core';
import { mergeEffective } from './store/overlay';
import { buildPortIndex, cableEndpointName } from './peerResolve';
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

/** PLACEMENT_FIELDS 집합 — @twin/core 상수에서 파생 (B-V3 시정: 로컬 재정의 금지) */
const PLACEMENT_FIELDS_SET = new Set<string>(PLACEMENT_FIELDS);

/**
 * 공량 계산에 쓰는 케이블 길이.
 *
 * 어느 종류든 갖는 공통 값이라 키를 여기 적지 않고 선언에서 가져온다 —
 * 키가 바뀌면 설계서 공량이 조용히 0이 되는 자리다.
 */
function cableLengthM(specParams: unknown): number | null {
  const key = COMMON_CABLE_FIELDS[0]!.key;
  const v = (specParams as Record<string, unknown> | null | undefined)?.[key];
  return typeof v === 'number' ? v : null;
}

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

  // effective assets: mergeEffective 단일 구현 사용 (B-V2 시정: 수제 병합 제거)
  const effectiveAssets = mergeEffective(saved.assets, overlays.assets);

  // portId → { port, asset } 인덱스 — buildPortIndex 공유 헬퍼 (aRef/bRef 접근은 cableEndpointName 경유)
  const portIndex = buildPortIndex(effectiveAssets);

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
    const hasBatchField = Object.keys(patch).some((k) => PLACEMENT_FIELDS_SET.has(k));
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
    // 이름 = "자산A↔자산B" (effective assets에서 포트 소유 해소 — cableEndpointName 한 곳 규칙)
    const aName = portIndex.get(cable.aPortId)?.asset.name;
    const bName = portIndex.get(cable.bPortId)?.asset.name;
    const name = aName && bName ? `${aName}↔${bName}` : '케이블';
    const lengthM = cableLengthM(cable.specParams);
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
    // saved cables에서 refs 이름 해소 — cableEndpointName 한 곳 규칙 (aRef/bRef 직접 접근 금지)
    const aName = cableEndpointName(cable, cable.aPortId, portIndex);
    const bName = cableEndpointName(cable, cable.bPortId, portIndex);
    const name = cable.name ?? (aName && bName ? `${aName}↔${bName}` : '케이블');
    const lengthM = cableLengthM(cable.specParams);
    items.push(cableReportItem('cable-remove', name, {
      name: group.name,
      laborType: group.laborType,
      installHoursPerM: group.installHoursPerM,
      removeHoursPerM: group.removeHoursPerM,
    }, lengthM));
  }

  return items;
}
