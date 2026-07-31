import type { V2Asset, V2AssetCreateInput, V2AssetPatch, V2AssetPhoto, V2Cable, V2CableCreateInput, V2CablePatch, V2CommitPayload, V2InspectionLog, V2MaintenanceLog } from '../types';
import type { Overlay } from './overlay';

interface OverlaysIn {
  assets: Overlay<V2Asset>;
  maintenance: Overlay<V2MaintenanceLog>;
  inspections: Overlay<V2InspectionLog>;
  cables: Overlay<V2Cable>;
  photos: Overlay<V2AssetPhoto>;
}

function toCreateInput(a: V2Asset): V2AssetCreateInput {
  return {
    id: a.id, name: a.name, typeId: a.typeId, status: a.status,
    floorId: a.floorId, x: a.x, y: a.y, width: a.width, height: a.height,
    parentAssetId: a.parentAssetId, containerKey: a.containerKey, slotIndex: a.slotIndex, slotSpan: a.slotSpan,
    fieldValues: a.fieldValues,
  };
}

function toCableCreateInput(c: V2Cable): V2CableCreateInput {
  return { id: c.id, aPortId: c.aPortId, bPortId: c.bPortId, categoryId: c.categoryId, name: c.name, pathPoints: c.pathPoints, specParams: c.specParams };
}

/** creates/updates/deletes 중 하나라도 있으면 빈 키를 뺀 sparse 객체로, 전부 비면 undefined — assets/cables/records 3곳이 손 복제하던 마무리 래핑. */
function pruneEmpty<C, U>(
  creates: C[],
  updates: U[],
  deletes: string[],
): { creates?: C[]; updates?: U[]; deletes?: string[] } | undefined {
  if (!creates.length && !updates.length && !deletes.length) return undefined;
  return {
    ...(creates.length ? { creates } : {}),
    ...(updates.length ? { updates } : {}),
    ...(deletes.length ? { deletes } : {}),
  };
}

export function buildCommitPayload(
  overlays: OverlaysIn,
  baseVersions: Record<string, string>,
  recordAssetIds: Record<string, string> = {},
): V2CommitPayload {
  const payload: V2CommitPayload = {};
  const deletedAssets = new Set(overlays.assets.deletes);

  const creates = Object.values(overlays.assets.creates).map(toCreateInput);
  const updates = Object.entries(overlays.assets.updates)
    .filter(([id]) => !deletedAssets.has(id))
    .map(([id, patch]) => ({ id, patch: patch as V2AssetPatch }));
  const deletes = overlays.assets.deletes;
  const assetsBlock = pruneEmpty(creates, updates, deletes);
  if (assetsBlock) payload.assets = assetsBlock;

  const bv: Record<string, string> = {};
  for (const id of [...updates.map((u) => u.id), ...deletes]) {
    if (baseVersions[id]) bv[id] = baseVersions[id]!;
  }

  // cables
  const deletedCables = new Set(overlays.cables.deletes);
  const cableCreates = Object.values(overlays.cables.creates).map(toCableCreateInput);
  const cableUpdates = Object.entries(overlays.cables.updates)
    .filter(([id]) => !deletedCables.has(id))
    .map(([id, patch]) => ({ id, patch: patch as V2CablePatch }));
  const cableDeletes = overlays.cables.deletes;
  const cablesBlock = pruneEmpty(cableCreates, cableUpdates, cableDeletes);
  if (cablesBlock) payload.cables = cablesBlock;
  for (const id of [...cableUpdates.map((u) => u.id), ...cableDeletes]) {
    if (baseVersions[id]) bv[id] = baseVersions[id]!;
  }

  if (Object.keys(bv).length) payload.baseVersions = bv;

  const maintenance = recordOps(overlays.maintenance, deletedAssets, recordAssetIds, (r) => ({
    id: r.id, assetId: r.assetId, occurredAt: r.occurredAt, content: r.content, action: r.action,
  }));
  const inspections = recordOps(overlays.inspections, deletedAssets, recordAssetIds, (r) => ({
    id: r.id, assetId: r.assetId, inspectedAt: r.inspectedAt, content: r.content, result: r.result,
  }));
  const photos = recordOps(overlays.photos, deletedAssets, recordAssetIds, (r) => ({
    id: r.id, assetId: r.assetId, filePath: r.filePath, caption: r.caption,
  }));
  if (maintenance || inspections || photos) {
    payload.records = { ...(maintenance ? { maintenance } : {}), ...(inspections ? { inspections } : {}), ...(photos ? { photos } : {}) };
  }
  return payload;
}

function recordOps<T extends { id: string; assetId: string; updatedAt: string }, C>(
  o: Overlay<T>,
  deletedAssets: ReadonlySet<string>,
  recordAssetIds: Record<string, string>,
  toCreate: (r: T) => C,
): { creates?: C[]; updates?: { id: string; patch: Partial<T> }[]; deletes?: string[] } | null {
  const creates = Object.values(o.creates).filter((r) => !deletedAssets.has(r.assetId)).map(toCreate);
  const updates = Object.entries(o.updates)
    .filter(([id]) => !deletedAssets.has(recordAssetIds[id] ?? ''))
    .map(([id, patch]) => {
      const { updatedAt: _u, assetId: _a, id: _i, ...rest } = patch as Record<string, unknown>;
      return { id, patch: rest as Partial<T> };
    });
  const deletes = o.deletes.filter((id) => !deletedAssets.has(recordAssetIds[id] ?? ''));
  return pruneEmpty(creates, updates, deletes) ?? null;
}
