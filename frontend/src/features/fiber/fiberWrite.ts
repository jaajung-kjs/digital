interface OfdRef { id: string; substationId: string; substationName: string | null }
interface CatRef { id: string; name: string }

export interface SlotCreate {
  id: string; substationId: string; assetTypeId: string;
  assetType: { code: string; role: 'slot' };
  name: string; parentAssetId: string;
  floorId: null; positionX: null; positionY: null; width2d: null; height2d: null;
  rotation: number; totalU: null; slotIndex: null; slotSpan: null;
  description: null; manager: null; installDate: null; status: null;
  sourcePresetId: null; sortOrder: number; updatedAt: string;
}
export interface CableCreate {
  id: string; sourceAssetId: string; targetAssetId: string;
  categoryId: string; categoryName: string;
  sourceRole: 'IN' | 'OUT' | null; targetRole: 'IN' | 'OUT' | null; number: number | null;
  specParams: Record<string, unknown>; specification: string;
  pathPoints: [number, number][] | null; pathLength: number | null; bufferLength: number; totalLength: number | null;
}

const baseSlot = (id: string, ofd: OfdRef, remoteName: string, slotTypeId: string): SlotCreate => ({
  id, substationId: ofd.substationId, assetTypeId: slotTypeId,
  assetType: { code: 'OFD-SLOT', role: 'slot' },
  name: remoteName, parentAssetId: ofd.id,
  floorId: null, positionX: null, positionY: null, width2d: null, height2d: null,
  rotation: 0, totalU: null, slotIndex: null, slotSpan: null,
  description: null, manager: null, installDate: null, status: null,
  sourcePresetId: null, sortOrder: 0, updatedAt: '',
});

/** OFD↔OFD 경로 = 슬롯2(각 OFD 자식, 대국명) + OPGW(IN-IN, cores). */
export function buildRouteCreate(p: {
  localOfd: OfdRef; remoteOfd: OfdRef; cores: number; slotTypeId: string; opgwCategory: CatRef;
  ids: { slotA: string; slotB: string; opgw: string };
}): { slots: SlotCreate[]; opgw: CableCreate } {
  const slotA = baseSlot(p.ids.slotA, p.localOfd, p.remoteOfd.substationName ?? '대국', p.slotTypeId);
  const slotB = baseSlot(p.ids.slotB, p.remoteOfd, p.localOfd.substationName ?? '대국', p.slotTypeId);
  const opgw: CableCreate = {
    id: p.ids.opgw, sourceAssetId: p.ids.slotA, targetAssetId: p.ids.slotB,
    categoryId: p.opgwCategory.id, categoryName: p.opgwCategory.name,
    sourceRole: 'IN', targetRole: 'IN', number: null,
    specParams: { cores: p.cores }, specification: p.opgwCategory.name,
    pathPoints: null, pathLength: null, bufferLength: 4, totalLength: null,
  };
  return { slots: [slotA, slotB], opgw };
}

/** 슬롯↔설비 OUT 코어 케이블. 규약: 슬롯=source(role OUT), 설비=target(role 없음) — 시드와 동일. */
export function buildCoreOutCable(p: {
  id: string; assetId: string; slotId: string; coreNumber: number; category: CatRef;
  pathPoints: [number, number][] | null; pathLength: number | null; bufferLength: number; totalLength: number | null;
}): CableCreate {
  return {
    id: p.id, sourceAssetId: p.slotId, targetAssetId: p.assetId,
    categoryId: p.category.id, categoryName: p.category.name,
    sourceRole: 'OUT', targetRole: null, number: p.coreNumber,
    specParams: {}, specification: p.category.name,
    pathPoints: p.pathPoints, pathLength: p.pathLength, bufferLength: p.bufferLength, totalLength: p.totalLength,
  };
}

interface CableLike { id: string; sourceAssetId?: string | null; targetAssetId?: string | null; sourceRole?: string | null; targetRole?: string | null }
/** 경로 삭제 = 두 슬롯 + 그 슬롯에 닿는 모든 FIBER 케이블(OPGW+OUT). */
export function routeDeleteIds(slotAId: string, slotBId: string, cables: CableLike[]): { assetIds: string[]; cableIds: string[] } {
  const slots = new Set([slotAId, slotBId]);
  const cableIds = cables
    .filter((c) => (c.sourceAssetId && slots.has(c.sourceAssetId)) || (c.targetAssetId && slots.has(c.targetAssetId)))
    .map((c) => c.id);
  return { assetIds: [slotAId, slotBId], cableIds };
}
