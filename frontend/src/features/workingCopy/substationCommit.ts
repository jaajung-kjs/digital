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
//      sourcePresetId→properties.sourcePresetId)
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
 * 단계4b — 백엔드 cableCreate 스키마는 `tempId` + 단일 `sourceAssetId`/`targetAssetId`
 * 만 요구한다(nested source/target 제거). store row 는 id(=tempId) 와 단일 assetId 를
 * 들고 있다. 여기서 id→tempId 로 옮기고 canonical 필드만 통과시킨다.
 */
function toCableCreate(c: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    tempId: c.id,
    sourceAssetId: c.sourceAssetId,
    targetAssetId: c.targetAssetId,
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

// ── 자산/랙모듈 공통 스칼라 필드(SSOT) ─────────────────────────────────────────
// 랙 모듈도 결국 Asset 행이다. 두 경로(assets / rackModules)가 따로 필드를 나열하면
// 한 곳이 빠져 드롭 버그(예: status OFF→ON 복귀)가 난다 → 공통 스칼라는 *여기 한 곳*에서.
const ASSET_COMMON_FIELDS = [
  'name', 'installDate', 'manager', 'description', 'status', 'warrantyUntil', 'replaceDue', 'sortOrder',
] as const;

/** patch/asset 에서 존재하는 공통 스칼라 필드만 추려 담는다. */
function pickCommon(src: Record<string, unknown>, includeUndefined: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ASSET_COMMON_FIELDS) {
    if (k in src && (includeUndefined || src[k] !== undefined)) out[k] = src[k];
  }
  return out;
}

/** sourcePresetId(전용 컬럼) → 백엔드 랙모듈 properties.sourcePresetId(#7) 매핑. */
function sourcePresetToProps(v: unknown): { sourcePresetId: string } | null {
  return v ? { sourcePresetId: v as string } : null;
}

/** Asset create → rackModules.create. 모듈 전용 키 + 공통 스칼라(한 곳). */
function toRackModuleCreate(a: Asset & { id: string }): Record<string, unknown> {
  const rec = a as unknown as Record<string, unknown>;
  return {
    tempId: a.id,
    rackEquipmentId: a.parentAssetId,
    categoryId: a.assetTypeId,
    slotIndex: a.slotIndex,
    slotSpan: a.slotSpan ?? 1,
    ...(a.sourcePresetId != null ? { properties: sourcePresetToProps(a.sourcePresetId) } : {}),
    ...pickCommon(rec, false),
  };
}

/** Asset create → assets.create (placement 포함). 공통 스칼라 + 자산 전용 키. */
function toAssetCreate(a: Asset & { id: string }): Record<string, unknown> {
  const rec = a as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {
    tempId: a.id,
    assetTypeId: a.assetTypeId,
    ...pickCommon(rec, false),
  };
  // 자산 전용(모듈엔 없음): 참조/배치 키. 공통 스칼라는 위 pickCommon 한 곳에서.
  const assetOnly: (keyof Asset)[] = [
    'parentAssetId', 'roomText', 'sourcePresetId',
    'floorId', 'positionX', 'positionY', 'width2d', 'height2d', 'rotation', 'totalU',
  ];
  for (const k of assetOnly) {
    const v = rec[k as string];
    if (v !== undefined) out[k as string] = v;
  }
  return out;
}

/**
 * Asset patch → rackModules.patch. 모듈 전용 키만 *이름을 바꿔* 매핑하고, 나머지 자산
 * 스칼라는 *그대로 통과*시킨다(allowlist 없음 → 새 필드를 추가해도 드롭 불가). 모듈과
 * 무관한 키(placement 등)는 백엔드 Zod 가 strip 하므로 과잉 전송은 무해.
 * (자산 patch 는 raw 로 전송 → 두 경로 모두 "필드 나열"이 사라져 드롭 버그가 구조적으로 불가능.)
 */
function toRackModulePatch(patch: Partial<Asset>): Record<string, unknown> {
  const p = { ...(patch as Record<string, unknown>) };
  const out: Record<string, unknown> = {};
  if ('parentAssetId' in p) { out.rackEquipmentId = p.parentAssetId; delete p.parentAssetId; }
  if ('assetTypeId' in p) { out.categoryId = p.assetTypeId; delete p.assetTypeId; }
  if ('sourcePresetId' in p) { out.properties = sourcePresetToProps(p.sourcePresetId); delete p.sourcePresetId; }
  return { ...p, ...out };
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
