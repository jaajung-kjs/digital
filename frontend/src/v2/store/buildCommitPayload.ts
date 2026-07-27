import type { V2Asset, V2AssetCreateInput, V2AssetPatch, V2CommitPayload, V2InspectionLog, V2MaintenanceLog } from '../types';
import type { Overlay } from './overlay';

interface OverlaysIn {
  assets: Overlay<V2Asset>;
  maintenance: Overlay<V2MaintenanceLog>;
  inspections: Overlay<V2InspectionLog>;
}

function toCreateInput(a: V2Asset): V2AssetCreateInput {
  return {
    id: a.id, name: a.name, typeId: a.typeId, status: a.status,
    floorId: a.floorId, x: a.x, y: a.y, width: a.width, height: a.height,
    parentAssetId: a.parentAssetId, containerKey: a.containerKey, slotIndex: a.slotIndex, slotSpan: a.slotSpan,
    fieldValues: a.fieldValues,
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
  const updates = Object.entries(overlays.assets.updates).map(([id, patch]) => ({ id, patch: patch as V2AssetPatch }));
  const deletes = overlays.assets.deletes;
  if (creates.length || updates.length || deletes.length) {
    payload.assets = {
      ...(creates.length ? { creates } : {}),
      ...(updates.length ? { updates } : {}),
      ...(deletes.length ? { deletes } : {}),
    };
  }

  const bv: Record<string, string> = {};
  for (const id of [...updates.map((u) => u.id), ...deletes]) {
    if (baseVersions[id]) bv[id] = baseVersions[id]!;
  }
  if (Object.keys(bv).length) payload.baseVersions = bv;

  const maintenance = recordOps(overlays.maintenance, deletedAssets, recordAssetIds, (r) => ({
    id: r.id, assetId: r.assetId, occurredAt: r.occurredAt, content: r.content, action: r.action,
  }));
  const inspections = recordOps(overlays.inspections, deletedAssets, recordAssetIds, (r) => ({
    id: r.id, assetId: r.assetId, inspectedAt: r.inspectedAt, content: r.content, result: r.result,
  }));
  if (maintenance || inspections) {
    payload.records = { ...(maintenance ? { maintenance } : {}), ...(inspections ? { inspections } : {}) };
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
  if (!creates.length && !updates.length && !deletes.length) return null;
  return {
    ...(creates.length ? { creates } : {}),
    ...(updates.length ? { updates } : {}),
    ...(deletes.length ? { deletes } : {}),
  };
}
