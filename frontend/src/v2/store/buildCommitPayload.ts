import type { V2Asset, V2AssetCreateInput, V2AssetPatch, V2AssetPhoto, V2Cable, V2CableCreateInput, V2CablePatch, V2CommitPayload, V2Floor, V2FloorPatch, V2InspectionLog, V2MaintenanceLog } from '../types';
import type { Overlay } from './overlay';

interface OverlaysIn {
  floors: Overlay<V2Floor>;
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
    parentAssetId: a.parentAssetId, col: a.col, row: a.row, colSpan: a.colSpan, rowSpan: a.rowSpan,
    fieldValues: a.fieldValues,
    // 설비 품목으로 놓은 것 — 분류(설비 품목 참조)와 포트 오버라이드를 함께 실어 보낸다.
    ...(a.assemblyId ? { assemblyId: a.assemblyId } : {}),
    /* 부품이면 **구성의 어느 항목에서 나왔는지** — 선로가 끊길 때 원래 이름을 되찾는 고리다. */
    ...(a.assemblyItemId ? { assemblyItemId: a.assemblyItemId } : {}),
    ...(a.portCounts ? { portCounts: a.portCounts } : {}),
    ...(a.portPositions ? { portPositions: a.portPositions } : {}),
    /* 화면이 정해 둔 포트 id — 저장 전에 그 포트에 이어 둔 케이블이 저장 뒤에도 같은 포트를
       가리켜야 한다. **구조는 서버 명세가 정하고** 여기서는 id 만 준다. */
    ...(a.ports.length > 0
      ? { portIds: Object.fromEntries(a.ports.map((p) => [`${p.group}:${p.index}`, p.id])) }
      : {}),
  };
}

/**
 * 오버레이의 자산 패치 → 서버가 받는 패치.
 *
 * 화면은 심선 값을 고칠 때 **포트 배열째로** 스테이지한다(그래야 effective 가 곧바로 새 값을
 * 보여 준다). 서버는 포트를 만들거나 지우지 않고 값만 고치므로, 여기서 `portFieldValues`
 * 로 옮겨 담고 `ports` 배열 자체는 보내지 않는다.
 */
function toAssetPatch(patch: Partial<V2Asset>): V2AssetPatch {
  const { ports, ...rest } = patch;
  const out = rest as V2AssetPatch;
  if (ports) {
    /* 종류가 바뀌었으면 그 포트들은 **새로 만들어지는 것**이다 — 값이 아니라 id 를 보낸다.
       (서버도 종류가 바뀌면 옛 포트를 걷고 명세대로 다시 만든다. 저장 전에 그 포트에 이어 둔
       케이블이 저장 뒤에도 같은 포트를 가리켜야 하므로 id 는 화면이 정한 것을 쓴다.) */
    if (patch.typeId !== undefined) {
      out.portIds = Object.fromEntries(ports.map((p) => [`${p.group}:${p.index}`, p.id]));
    } else {
      out.portFieldValues = ports.map((p) => ({ portId: p.id, fieldValues: p.fieldValues ?? {} }));
    }
  }
  return out;
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

  /* 층 — 자산과 같은 세 갈래. 만드는 층은 이름·순서만 보내고(자산은 그 층 id 를 가리킨다),
     고치는 것은 이름·순서·배경이다. */
  const deletedFloors = new Set(overlays.floors.deletes);
  const floorCreates = Object.values(overlays.floors.creates).map((f) => ({ id: f.id, name: f.name, sortOrder: f.sortOrder }));
  const floorUpdates = Object.entries(overlays.floors.updates)
    .filter(([id]) => !deletedFloors.has(id))
    .map(([id, patch]) => {
      const { id: _i, substationId: _s, updatedAt: _u, ...rest } = patch as Record<string, unknown>;
      return { id, patch: rest as V2FloorPatch };
    });
  const floorsBlock = pruneEmpty(floorCreates, floorUpdates, overlays.floors.deletes);
  if (floorsBlock) payload.floors = floorsBlock;

  const creates = Object.values(overlays.assets.creates).map(toCreateInput);
  const updates = Object.entries(overlays.assets.updates)
    .filter(([id]) => !deletedAssets.has(id))
    .map(([id, patch]) => ({ id, patch: toAssetPatch(patch) }));
  const deletes = overlays.assets.deletes;
  const assetsBlock = pruneEmpty(creates, updates, deletes);
  if (assetsBlock) payload.assets = assetsBlock;

  const bv: Record<string, string> = {};
  for (const id of [...updates.map((u) => u.id), ...deletes, ...floorUpdates.map((u) => u.id), ...overlays.floors.deletes]) {
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
    id: r.id, assetId: r.assetId, partAssetId: r.partAssetId ?? null,
    occurredAt: r.occurredAt, content: r.content, action: r.action,
  }));
  const inspections = recordOps(overlays.inspections, deletedAssets, recordAssetIds, (r) => ({
    id: r.id, assetId: r.assetId, partAssetId: r.partAssetId ?? null,
    inspectedAt: r.inspectedAt, content: r.content, result: r.result,
  }));
  /* 경로는 **보내지 않는다** — 파일이 이 요청에 함께 가고, 서버가 그 id 의 줄에 지어 준다. */
  const photos = recordOps(overlays.photos, deletedAssets, recordAssetIds, (r) => ({
    id: r.id, assetId: r.assetId, partAssetId: r.partAssetId ?? null,
    caption: r.caption,
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
