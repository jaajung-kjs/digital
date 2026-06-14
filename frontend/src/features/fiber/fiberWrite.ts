interface OfdRef { id: string; substationId: string; substationName: string | null }
interface CatRef { id: string; code: string; name: string; displayColor: string | null }

export interface SlotCreate {
  id: string; substationId: string; assetTypeId: string;
  assetType: { code: string; connectionKind: 'conduit'; placementKind: null };
  name: string; parentAssetId: string;
  floorId: null; positionX: null; positionY: null; width2d: null; height2d: null;
  rotation: number; totalU: null; slotIndex: null; slotSpan: null;
  description: null; manager: null; installDate: null; status: null;
  warrantyUntil: null; replaceDue: null; sourcePresetId: null; sortOrder: number; updatedAt: string;
}
export interface CableCreate {
  id: string; sourceAssetId: string; targetAssetId: string; cableType: 'FIBER';
  categoryId: string; categoryCode: string; categoryName: string; displayColor: string | null;
  sourceRole: 'IN' | 'OUT' | null; targetRole: 'IN' | 'OUT' | null; number: number | null;
  specParams: Record<string, unknown>; specification: string;
  pathPoints: [number, number][] | null; pathLength: number | null; bufferLength: number; totalLength: number | null;
}

const baseSlot = (id: string, ofd: OfdRef, remoteName: string, slotTypeId: string): SlotCreate => ({
  id, substationId: ofd.substationId, assetTypeId: slotTypeId,
  assetType: { code: 'OFD-SLOT', connectionKind: 'conduit', placementKind: null },
  name: remoteName, parentAssetId: ofd.id,
  floorId: null, positionX: null, positionY: null, width2d: null, height2d: null,
  rotation: 0, totalU: null, slotIndex: null, slotSpan: null,
  description: null, manager: null, installDate: null, status: null,
  warrantyUntil: null, replaceDue: null, sourcePresetId: null, sortOrder: 0, updatedAt: '',
});

/** OFD↔OFD 경로 = 슬롯2(각 OFD 자식, 대국명) + OPGW(IN-IN, cores). */
export function buildRouteCreate(p: {
  localOfd: OfdRef; remoteOfd: OfdRef; cores: number; slotTypeId: string; opgwCategory: CatRef;
  ids: { slotA: string; slotB: string; opgw: string };
}): { slots: SlotCreate[]; opgw: CableCreate } {
  const slotA = baseSlot(p.ids.slotA, p.localOfd, p.remoteOfd.substationName ?? '대국', p.slotTypeId);
  const slotB = baseSlot(p.ids.slotB, p.remoteOfd, p.localOfd.substationName ?? '대국', p.slotTypeId);
  const opgw: CableCreate = {
    id: p.ids.opgw, sourceAssetId: p.ids.slotA, targetAssetId: p.ids.slotB, cableType: 'FIBER',
    categoryId: p.opgwCategory.id, categoryCode: p.opgwCategory.code, categoryName: p.opgwCategory.name,
    displayColor: p.opgwCategory.displayColor, sourceRole: 'IN', targetRole: 'IN', number: null,
    specParams: { cores: p.cores }, specification: p.opgwCategory.name,
    pathPoints: null, pathLength: null, bufferLength: 4, totalLength: null,
  };
  return { slots: [slotA, slotB], opgw };
}

/** 설비↔슬롯 OUT 코어 케이블. 슬롯 끝 = OUT. */
export function buildCoreOutCable(p: {
  id: string; equipmentId: string; slotId: string; coreNumber: number; category: CatRef;
  pathPoints: [number, number][] | null; pathLength: number | null; bufferLength: number; totalLength: number | null;
}): CableCreate {
  return {
    id: p.id, sourceAssetId: p.equipmentId, targetAssetId: p.slotId, cableType: 'FIBER',
    categoryId: p.category.id, categoryCode: p.category.code, categoryName: p.category.name,
    displayColor: p.category.displayColor, sourceRole: null, targetRole: 'OUT', number: p.coreNumber,
    specParams: {}, specification: p.category.name,
    pathPoints: p.pathPoints, pathLength: p.pathLength, bufferLength: p.bufferLength, totalLength: p.totalLength,
  };
}

/** 점유 코어번호 + 용량 → 가장 작은 빈 번호(없으면 용량+1로 확장). */
export function nextFreeCore(occupied: number[], cores: number): number {
  const set = new Set(occupied);
  for (let n = 1; n <= cores; n++) if (!set.has(n)) return n;
  return cores + 1;
}

interface CableLike { id: string; sourceAssetId?: string | null; targetAssetId?: string | null; sourceRole?: string | null; targetRole?: string | null; cableType?: string | null }
/** 경로 삭제 = 두 슬롯 + 그 슬롯에 닿는 모든 FIBER 케이블(OPGW+OUT). */
export function routeDeleteIds(slotAId: string, slotBId: string, cables: CableLike[]): { assetIds: string[]; cableIds: string[] } {
  const slots = new Set([slotAId, slotBId]);
  const cableIds = cables
    .filter((c) => c.cableType === 'FIBER' && ((c.sourceAssetId && slots.has(c.sourceAssetId)) || (c.targetAssetId && slots.has(c.targetAssetId))))
    .map((c) => c.id);
  return { assetIds: [slotAId, slotBId], cableIds };
}
