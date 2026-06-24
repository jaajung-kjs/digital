import type { QueryClient } from '@tanstack/react-query';
import { PHOTOS } from './recordTypes';
import { api } from '../../utils/api';
import type { Asset } from '../../types/asset';
import { buildDelta } from './delta';
import type { Overlay } from './overlay';
import { RACK_MODULE_KEYS } from '../rack/hooks/useRackModules';

// ──────────────────────────────────────────────────────────────────────────
// commit 빌더 — 전역 워킹카피 overlay(assets / cables / records)를
// 전역 커밋 `POST /commit` 페이로드로 변환한다(변전소 스코프 없음). 신규 자산은 자기
// substationId 를 싣고, records 는 recordType(DB 테이블명)으로 백엔드가 제네릭 라우팅한다.
//
// 모든 Asset(placement 노드 + 하위 자산: 랙 모듈·피더·분기)을 단일 `assets` 컬렉션으로
// 보낸다. 종전엔 랙 모듈만 별도 payload.rackModules 로 분리했으나, 같은 Asset 인데 경로가
// 갈려 substationId·parentAssetId(tempId) 해소가 달라 하위 자산 저장이 깨졌다(422 FK).
// 통합 후 백엔드는 slotIndex 유무로 랙 슬롯 검증만 조건부 적용한다.
// ──────────────────────────────────────────────────────────────────────────

type RecordRow = Record<string, unknown>;
// 조직 행은 구체 타입(OrgHeadquarters 등)이라 Record<string,unknown> 인덱스 시그니처가 없다.
// buildOrgCollection 은 id + 임의 키 접근만 하므로 { id } 베이스로 받아 구체 타입과 호환시킨다.
type OrgRow = { id: string };
type Overlays = {
  assets: Overlay<Asset, Partial<Asset>>;
  cables: Overlay<Record<string, unknown>, Partial<Record<string, unknown>>>;
  records: Overlay<RecordRow, Partial<RecordRow>>;
  // 조직 4컬렉션(Task 4) — assets/cables 와 동일한 buildDelta 엔진으로 델타화한다.
  headquarters?: Overlay<OrgRow, Partial<OrgRow>>;
  branches?: Overlay<OrgRow, Partial<OrgRow>>;
  substations?: Overlay<OrgRow, Partial<OrgRow>>;
  floors?: Overlay<OrgRow, Partial<OrgRow>>;
};

interface Collection {
  creates: Record<string, unknown>[];
  updates: { id: string; baseVersion: string | null; patch: Record<string, unknown> }[];
  deletes: { id: string; baseVersion: string | null }[];
}

/** 자산 하위레코드(점검/로그/사진) 델타 — update/delete 에 recordType 을 실어 백엔드가 테이블 라우팅. */
interface RecordsCollection {
  creates: Record<string, unknown>[];
  updates: { id: string; recordType: string; baseVersion: string | null; patch: Record<string, unknown> }[];
  deletes: { id: string; recordType: string; baseVersion: string | null }[];
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

interface SubstationCommitPayload {
  assets?: Collection;
  cables?: Collection;
  records?: RecordsCollection;
  floor?: FloorCommitSection;
  headquarters?: Collection;
  branches?: Collection;
  substations?: Collection;
  floors?: Collection;
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
  };
  const passthrough = [
    'length', 'description',
    'categoryId', 'specParams', 'pathPoints', 'pathLength', 'bufferLength', 'totalLength',
    'sourceRole', 'targetRole', 'number',
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

/** Asset create → assets.create (placement·슬롯 포함). 공통 스칼라 + 자산 전용 키. */
function toAssetCreate(a: Asset & { id: string }): Record<string, unknown> {
  const rec = a as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {
    tempId: a.id,
    assetTypeId: a.assetTypeId,
    // 전역 커밋: 신규 자산은 자기 substationId 를 싣는다(어느 변전소 노드든 한 커밋에).
    substationId: a.substationId,
    ...pickCommon(rec, false),
  };
  // 참조/배치/슬롯 키(공통 스칼라는 위 pickCommon 한 곳에서). 모든 하위 자산이 단일 경로로
  // 가므로 슬롯(slotIndex/slotSpan)도 여기서 함께 — slotIndex 있으면 백엔드가 랙 모듈로 검증.
  const assetOnly: (keyof Asset)[] = [
    'parentAssetId', 'roomText', 'sourcePresetId', 'slotIndex', 'slotSpan',
    'floorId', 'positionX', 'positionY', 'width2d', 'height2d', 'rotation', 'totalU',
  ];
  for (const k of assetOnly) {
    const v = rec[k as string];
    if (v !== undefined) out[k as string] = v;
  }
  return out;
}

/**
 * records(점검/로그/사진) overlay → records 델타. update/delete 에 recordType 을 실어
 * 백엔드가 대상 테이블을 라우팅한다(recordType 은 saved 레코드에서 조회). 사진 create 는
 * 커밋 직전 업로드한 imageUrl(photoUrls)로 바이너리를 대체한다 — File/objectUrl 은 보내지 않는다.
 */
function buildRecordsCollection(
  overlay: Overlay<RecordRow, Partial<RecordRow>>,
  savedRecords: { id: string; recordType: string }[],
  photoUrls: Map<string, string>,
): RecordsCollection | undefined {
  const d = buildDelta(overlay);
  const typeById = new Map(savedRecords.map((r) => [r.id, r.recordType]));

  const creates = d.creates.map((c) => {
    const rec = c as Record<string, unknown>;
    if (rec.recordType === PHOTOS) {
      return {
        tempId: rec.id,
        assetId: rec.assetId,
        recordType: PHOTOS,
        side: rec.side,
        description: rec.description ?? null,
        imageUrl: photoUrls.get(rec.id as string), // 업로드 실패 시 undefined → 백엔드가 skip
      };
    }
    // inspections/logs: 종류 필드 통과(id→tempId, blob/메타 제거).
    const { id, objectUrl: _o, file: _f, ...rest } = rec;
    return { ...rest, tempId: id };
  });

  const updates = d.updates
    .map((u) => ({ id: u.id, recordType: typeById.get(u.id), baseVersion: u.baseVersion, patch: u.patch }))
    .filter((u): u is RecordsCollection['updates'][number] => u.recordType !== undefined);
  const deletes = d.deletes
    .map((del) => ({ id: del.id, recordType: typeById.get(del.id), baseVersion: del.baseVersion }))
    .filter((del): del is RecordsCollection['deletes'][number] => del.recordType !== undefined);

  return creates.length || updates.length || deletes.length ? { creates, updates, deletes } : undefined;
}

// ── 조직 4컬렉션 델타 ────────────────────────────────────────────────────────
// headquarters/branches/substations/floors 는 assets/cables 와 동일한 buildDelta
// 엔진을 쓴다(create+update 병합·create tempId redundant update 제외·OCC baseVersion).
// create 는 id→tempId 로 옮기고 컬렉션별 허용 필드만 통과시킨다. 부모 FK
// (headquartersId/branchId/substationId)는 같은 커밋의 staged tempId 일 수 있으나
// 그대로 보낸다 — 백엔드가 idMap 으로 해소한다(Task 3).
const ORG_CREATE_FIELDS: Record<string, string[]> = {
  headquarters: ['name', 'sortOrder'],
  branches: ['name', 'sortOrder', 'headquartersId'],
  substations: ['name', 'sortOrder', 'branchId', 'address'],
  floors: ['name', 'sortOrder', 'substationId', 'floorNumber'],
};

function buildOrgCollection(
  overlay: Overlay<OrgRow, Partial<OrgRow>> | undefined,
  fields: string[],
): Collection | undefined {
  if (!overlay) return undefined;
  const d = buildDelta(overlay);
  const col: Collection = {
    creates: d.creates.map((c) => {
      const rec = c as Record<string, unknown>;
      const out: Record<string, unknown> = { tempId: rec.id };
      for (const k of fields) {
        if (rec[k] !== undefined) out[k] = rec[k];
      }
      return out;
    }),
    updates: d.updates.map((u) => ({
      id: u.id,
      baseVersion: u.baseVersion,
      patch: u.patch as Record<string, unknown>,
    })),
    deletes: d.deletes,
  };
  return omitIfEmpty(col);
}

/**
 * overlay 세트를 2a 커밋 페이로드로 변환한다.
 *
 * @param overlays  store 의 overlays(assets/cables/records)
 * @param savedRecords  saved 레코드 — records update/delete 의 recordType 라우팅용.
 * @param photoUrls  커밋 직전 업로드한 사진 imageUrl(레코드 tempId → URL).
 */
export function buildSubstationCommitPayload(
  overlays: Overlays,
  savedRecords: { id: string; recordType: string }[],
  photoUrls: Map<string, string>,
  floor?: FloorCommitSection,
): SubstationCommitPayload {
  // assets — 모든 하위 자산(랙 모듈·피더·분기)을 단일 컬렉션으로. 종전 rackModules 분리는
  // 폐지: 같은 Asset 인데 경로가 갈려 substationId·parentAssetId(tempId) 해소가 달라 저장
  // 버그가 났다. 백엔드는 slotIndex 유무로 랙 슬롯 검증만 조건부 적용한다.
  const ad = buildDelta(overlays.assets);
  const assetsCol: Collection = {
    creates: ad.creates.map((c) => toAssetCreate(c as Asset & { id: string })),
    updates: ad.updates.map((u) => ({
      id: u.id,
      baseVersion: u.baseVersion,
      patch: u.patch as Record<string, unknown>,
    })),
    deletes: ad.deletes,
  };

  // cables — create 는 id→tempId + nested source/target 로 매핑(toCableCreate).
  // update/delete 는 {id, baseVersion, patch} 그대로(패치는 nested-agnostic).
  const cd = buildDelta(overlays.cables);
  const cables: Collection = {
    creates: cd.creates.map((c) => toCableCreate(c as Record<string, unknown>)),
    updates: cd.updates as Collection['updates'],
    deletes: cd.deletes,
  };
  const records = buildRecordsCollection(overlays.records, savedRecords, photoUrls);

  // 조직 4컬렉션 — assets/cables 와 동일 엔진. 비면 omitIfEmpty 가 키 자체를 생략.
  const headquarters = buildOrgCollection(overlays.headquarters, ORG_CREATE_FIELDS.headquarters);
  const branches = buildOrgCollection(overlays.branches, ORG_CREATE_FIELDS.branches);
  const substations = buildOrgCollection(overlays.substations, ORG_CREATE_FIELDS.substations);
  const floors = buildOrgCollection(overlays.floors, ORG_CREATE_FIELDS.floors);

  return {
    assets: omitIfEmpty(assetsCol),
    cables: omitIfEmpty(cables),
    ...(records ? { records } : {}),
    ...(floor ? { floor } : {}),
    ...(headquarters ? { headquarters } : {}),
    ...(branches ? { branches } : {}),
    ...(substations ? { substations } : {}),
    ...(floors ? { floors } : {}),
  };
}

/**
 * 변전소 working copy 를 단일 트랜잭션으로 커밋한다.
 * 성공 시 관련 query 를 invalidate 하고 idMaps/updated 를 돌려준다.
 * VersionConflictError(409)는 그대로 throw — 호출부(2c/2d)가 ConflictDialog 처리.
 */
export async function commitSubstation(
  overlays: Overlays,
  savedRecords: { id: string; recordType: string }[],
  photoUrls: Map<string, string>,
  queryClient: QueryClient,
  floor?: FloorCommitSection,
): Promise<SubstationCommitResult> {
  const payload = buildSubstationCommitPayload(overlays, savedRecords, photoUrls, floor);
  // 전역 단일 커밋 — 변전소 스코프 없음. overlay 전체(어느 변전소든)를 한 트랜잭션에.
  const { data } = await api.post(`/commit`, payload);

  // 통합 커밋은 asset/cable/floor/rack 을 건드린다. 실제로 읽히는(살아있는) 쿼리만 무효화한다 —
  // 나머지 뷰는 effective(워킹카피 saved∪overlay)를 읽으므로 load/hydrate 로 갱신된다.
  // (effective 이주 전 잔재였던 ['assets',id]·['substation-connections']·['fiber-paths']·
  //  ['ofd-directory'] 무효화는 읽는 useQuery 가 없어 제거.)
  queryClient.invalidateQueries({ queryKey: ['nodeAssets'] });
  queryClient.invalidateQueries({ queryKey: ['floorPlan'] });
  queryClient.invalidateQueries({ queryKey: ['floor'] });
  queryClient.invalidateQueries({ queryKey: ['cables'] });
  queryClient.invalidateQueries({ queryKey: RACK_MODULE_KEYS.all });
  queryClient.invalidateQueries({ queryKey: ['stats', 'rack-modules'] });

  return data.data as SubstationCommitResult;
}
