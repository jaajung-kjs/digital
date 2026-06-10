import type { QueryClient } from '@tanstack/react-query';
import { api } from '../../utils/api';
import type { Asset } from '../../types/asset';
import { buildDelta } from './delta';
import type { Overlay } from './overlay';
import { RACK_MODULE_KEYS } from '../rack/hooks/useRackModules';

// ──────────────────────────────────────────────────────────────────────────
// SSOT-2b Task 4 — commit 빌더.
//
// 통합 store(Task 3)의 overlay 3종(assets / cables / fiberPaths)을 2a
// `POST /substations/:id/commit` 페이로드로 변환한다(분전 회로는 단계3b 에서 asset 흡수).
//
// 핵심은 단일 `assets` overlay 를 페이로드의 두 컬렉션으로 *분리*하는 것:
//   - placement-level Asset(OFD/RACK/DIST/GROUNDING/HVAC) → payload.assets
//   - 랙 자식(모듈)                                        → payload.rackModules
//     (필드명 매핑: parentAssetId→rackEquipmentId, assetTypeId→categoryId,
//      attributes→properties)
//
// 분류 규칙(Task 3 와 동일): asset 이 `parentAssetId != null && slotIndex != null`
// 이면 랙 모듈. CREATE 는 create item 자신의 필드로, UPDATE/DELETE 는 patch 에
// id 만 있으므로 savedAssets 에서 lookup 해 판정한다.
// ──────────────────────────────────────────────────────────────────────────

type Overlays = {
  assets: Overlay<Asset, Partial<Asset>>;
  cables: Overlay<Record<string, unknown>, Partial<Record<string, unknown>>>;
  fiberPaths: Overlay<Record<string, unknown>, Partial<Record<string, unknown>>>;
};

interface Collection {
  creates: Record<string, unknown>[];
  updates: { id: string; baseVersion: string | null; patch: Record<string, unknown> }[];
  deletes: { id: string; baseVersion: string | null }[];
}

/**
 * 에디터가 보유한 floor-level 캔버스 설정. 2a 백엔드 commit 의 `floor` 섹션으로
 * 동봉돼 단일 트랜잭션에서 floor 컬럼까지 OCC 갱신한다.
 * baseVersion = 에디터가 로드한 floorPlan.updatedAt(ISO).
 * settings.backgroundDrawing 은 3-state(undefined=변경없음 / null=제거 / object=교체).
 */
export interface FloorCommitSection {
  id: string;
  baseVersion: string | null;
  settings?: {
    canvasWidth?: number;
    canvasHeight?: number;
    gridSize?: number;
    majorGridSize?: number;
    backgroundOpacity?: number;
    backgroundDrawing?: unknown;
  };
}

export interface SubstationCommitPayload {
  assets?: Collection;
  cables?: Collection;
  rackModules?: Collection;
  fiberPaths?: Collection;
  floor?: FloorCommitSection;
}

/**
 * 커밋 응답 — 2a 가 돌려주는 idMap/updated.
 * updated.floor 는 floor 섹션이 커밋됐을 때만 채워지며(새 floor.updatedAt),
 * 호출부가 이 값으로 editorStore.baseFloorVersion 을 동기적으로 갱신해
 * 2회차 저장 409(stale baseFloorVersion)를 차단한다.
 */
export interface SubstationCommitResult {
  idMaps?: Record<string, Record<string, string>>;
  updated?: { floor?: { id: string; updatedAt: string } } & Record<string, unknown>;
  [key: string]: unknown;
}

/** 분류에 쓰는 asset 의 최소 계약(saved/created 공통). */
interface AssetLike {
  id?: string;
  parentAssetId?: string | null;
  slotIndex?: number | null;
}

/** Task 3 규칙: parentAssetId 가 있고 slotIndex 가 null 이 아니면 랙 모듈 자식. */
function isRackModule(a: AssetLike | undefined): boolean {
  return !!a && a.parentAssetId != null && a.slotIndex != null;
}

/** creates/updates/deletes 가 모두 비면 undefined — 2a 백엔드가 해당 컬렉션 OCC findMany 를 건너뛴다. */
function omitIfEmpty(c: Collection): Collection | undefined {
  return c.creates.length || c.updates.length || c.deletes.length ? c : undefined;
}

/**
 * Cable create(store row) → cables.create payload.
 *
 * 백엔드 cableCreate 스키마는 `tempId` + nested `source`/`target` 를 요구한다.
 * store row 는 id(=tempId) 와 nested source/target 만 들고 있다(flat denormalize 제거됨).
 * 여기서 id→tempId 로 옮기고 canonical 필드만 통과시킨다. totalLength → length(설치 길이)
 * 매핑은 백엔드가 length/totalLength 를 모두 읽으므로 그대로 둘 다 보낸다.
 */
function toCableCreate(c: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    tempId: c.id,
    source: c.source ?? { equipmentId: null, moduleId: null, circuitId: null },
    target: c.target ?? { equipmentId: null, moduleId: null, circuitId: null },
    cableType: c.cableType,
  };
  const passthrough = [
    'label', 'length', 'color', 'description', 'fiberPathId', 'fiberPortNumber',
    'categoryId', 'specParams', 'pathPoints', 'pathLength', 'bufferLength', 'totalLength',
  ];
  for (const k of passthrough) {
    if (c[k] !== undefined) out[k] = c[k];
  }
  return out;
}

/** Asset create → rackModules.create (필드명 매핑). */
function toRackModuleCreate(a: Asset & { id: string }): Record<string, unknown> {
  const out: Record<string, unknown> = {
    tempId: a.id,
    rackEquipmentId: a.parentAssetId,
    categoryId: a.assetTypeId,
    name: a.name,
    slotIndex: a.slotIndex,
    slotSpan: a.slotSpan ?? 1,
  };
  if (a.installDate != null) out.installDate = a.installDate;
  if (a.manager != null) out.manager = a.manager;
  if (a.description != null) out.description = a.description;
  if (a.attributes != null) out.properties = a.attributes;
  if (a.sortOrder != null) out.sortOrder = a.sortOrder;
  return out;
}

/** Asset create → assets.create (placement 포함, 필드 verbatim). */
function toAssetCreate(a: Asset & { id: string }): Record<string, unknown> {
  const out: Record<string, unknown> = {
    tempId: a.id,
    assetTypeId: a.assetTypeId,
    name: a.name,
  };
  const passthrough: (keyof Asset)[] = [
    'parentAssetId', 'roomText', 'attributes', 'installDate', 'manager', 'status',
    'warrantyUntil', 'replaceDue',
    'floorId', 'positionX', 'positionY', 'width2d', 'height2d', 'rotation', 'totalU',
  ];
  const rec = a as unknown as Record<string, unknown>;
  for (const k of passthrough) {
    const v = rec[k as string];
    if (v !== undefined) out[k as string] = v;
  }
  return out;
}

/**
 * Asset patch → rackModules.patch — 존재하는 키만 매핑(renamed keys 포함).
 * parentAssetId→rackEquipmentId, assetTypeId→categoryId, attributes→properties.
 * 나머지(name/slotIndex/slotSpan/installDate/manager/description/sortOrder)는 동명.
 */
function toRackModulePatch(patch: Partial<Asset>): Record<string, unknown> {
  const p = patch as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if ('parentAssetId' in p) out.rackEquipmentId = p.parentAssetId;
  if ('assetTypeId' in p) out.categoryId = p.assetTypeId;
  if ('attributes' in p) out.properties = p.attributes;
  for (const k of ['name', 'slotIndex', 'slotSpan', 'installDate', 'manager', 'description', 'sortOrder'] as const) {
    if (k in p) out[k] = p[k];
  }
  return out;
}

/**
 * overlay 세트를 2a 커밋 페이로드로 변환한다.
 *
 * @param overlays  store 의 overlays(assets/cables/fiberPaths)
 * @param savedAssets  서버에서 로드한 saved asset 목록 — update/delete 분류용 lookup.
 */
export function buildSubstationCommitPayload(
  overlays: Overlays,
  savedAssets: Asset[],
  floor?: FloorCommitSection,
): SubstationCommitPayload {
  // assets 분리 ─────────────────────────────────────────────
  const savedById = new Map<string, AssetLike>();
  for (const a of savedAssets) savedById.set(a.id, a);

  const ad = buildDelta(overlays.assets);

  const assetsCol: Collection = { creates: [], updates: [], deletes: [] };
  const rackCol: Collection = { creates: [], updates: [], deletes: [] };

  // creates — create item 자신의 필드로 분류.
  for (const c of ad.creates) {
    const a = c as Asset & { id: string };
    if (isRackModule(a)) rackCol.creates.push(toRackModuleCreate(a));
    else assetsCol.creates.push(toAssetCreate(a));
  }

  // updates — savedAssets lookup 으로 분류(patch 엔 id 만 보장됨).
  for (const u of ad.updates) {
    if (isRackModule(savedById.get(u.id))) {
      rackCol.updates.push({ id: u.id, baseVersion: u.baseVersion, patch: toRackModulePatch(u.patch) });
    } else {
      assetsCol.updates.push({ id: u.id, baseVersion: u.baseVersion, patch: u.patch as Record<string, unknown> });
    }
  }

  // deletes — savedAssets lookup 으로 분류. {id, baseVersion} 그대로.
  for (const d of ad.deletes) {
    if (isRackModule(savedById.get(d.id))) rackCol.deletes.push(d);
    else assetsCol.deletes.push(d);
  }

  // cables — create 는 id→tempId + nested source/target 로 매핑(toCableCreate).
  // update/delete 는 {id, baseVersion, patch} 그대로(패치는 nested-agnostic).
  const cd = buildDelta(overlays.cables);
  const cables: Collection = {
    creates: cd.creates.map((c) => toCableCreate(c as Record<string, unknown>)),
    updates: cd.updates as Collection['updates'],
    deletes: cd.deletes,
  };
  const fiberPaths = buildDelta(overlays.fiberPaths) as Collection;

  return {
    assets: omitIfEmpty(assetsCol),
    rackModules: omitIfEmpty(rackCol),
    cables: omitIfEmpty(cables),
    fiberPaths: omitIfEmpty(fiberPaths),
    ...(floor ? { floor } : {}),
  };
}

/**
 * 변전소 working copy 를 단일 트랜잭션으로 커밋한다.
 * 성공 시 관련 query 를 invalidate 하고 idMaps/updated 를 돌려준다.
 * VersionConflictError(409)는 그대로 throw — 호출부(2c/2d)가 ConflictDialog 처리.
 */
export async function commitSubstation(
  substationId: string,
  overlays: Overlays,
  savedAssets: Asset[],
  queryClient: QueryClient,
  floor?: FloorCommitSection,
): Promise<SubstationCommitResult> {
  const payload = buildSubstationCommitPayload(overlays, savedAssets, floor);
  const { data } = await api.post(`/substations/${substationId}/commit`, payload);

  // 통합 커밋은 asset/cable/fiber/rack/dist 를 모두 건드린다 → commit.ts 의 무효화 세트를 그대로 미러.
  queryClient.invalidateQueries({ queryKey: ['nodeAssets'] });
  queryClient.invalidateQueries({ queryKey: ['assets', substationId] });
  queryClient.invalidateQueries({ queryKey: ['substation-connections', substationId] });
  queryClient.invalidateQueries({ queryKey: ['floorPlan'] });
  queryClient.invalidateQueries({ queryKey: ['floor'] });
  queryClient.invalidateQueries({ queryKey: ['fiber-paths'] });
  queryClient.invalidateQueries({ queryKey: ['cables'] });
  queryClient.invalidateQueries({ queryKey: ['ofd-directory'] });
  queryClient.invalidateQueries({ queryKey: RACK_MODULE_KEYS.all });
  queryClient.invalidateQueries({ queryKey: ['stats', 'rack-modules'] });

  return data.data as SubstationCommitResult;
}
