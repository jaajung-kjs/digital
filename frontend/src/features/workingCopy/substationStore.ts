import { create } from 'zustand';
import { temporal } from 'zundo';
import { shallow } from 'zustand/shallow';
import { api } from '../../utils/api';
import { isTempId } from '../../utils/idHelpers';
import { organizationApi } from '../../services/organizationApi';
import type { Asset } from '../../types/asset';
import type { OrgHeadquarters, OrgBranch, OrgSubstation, OrgFloor } from '../../types/organization';
import type { EquipmentKind } from '../../types/equipmentKind';
import {
  emptyOverlay,
  stageCreate,
  stageUpdate,
  stageDelete,
  overlayDirtyCount,
  snapshotBaseVersions,
  type Overlay,
} from './overlay';
import { mergeEffective } from './effective';
import type { CollectionDescriptor } from './descriptor';
import { type RecordTypeKey, PHOTOS } from './recordTypes';
import { toMapById } from '../../utils/byId';
import { isRackModuleAsset as isRackModuleChild } from './assetClassify';

/**
 * stageRackModuleCreate 의 입력 — 랙모듈 신규 staging 용 작은 명시 draw 타입.
 * (RackModule 뷰 타입을 캔버스/쓰기 경로에서 더 이상 쓰지 않으므로 분리한다.)
 */
export interface RackModuleDraw {
  id: string;
  rackEquipmentId: string;
  categoryId: string;
  name: string;
  slotIndex: number;
  slotSpan: number;
  installDate?: string | null;
  manager?: string | null;
  description?: string | null;
  properties?: Record<string, unknown> | null;
  sortOrder?: number;
}

// ──────────────────────────────────────────────────────────────────────────
// 전역 Unit-of-Work (변전소 스코프 없음).
//
// 데이터는 노드(assets, 자산 안 records[] 중첩) + 엣지(cables)가 전부이고
// 임의의 변전소 경계가 없다. saved 는 둘러본 만큼 누적되는 전역 캐시, overlay(스테이징)도
// 전역 — load 가 변전소를 바꿔도 비우지 않는다(자산 A는 어디서 열든 자산 A). 커밋은 overlay
// 전체를 POST /commit 한 트랜잭션으로(엔티티별 OCC). 각 컬렉션은 Lv1 엔진(overlay/effective/
// descriptor)을 재사용하고, undo/redo 는 zundo `temporal`(overlays 슬라이스, load 는 pause 로 비기록).
// ──────────────────────────────────────────────────────────────────────────

/**
 * cables row 의 최소 계약.
 * 배치 Asset 외 컬렉션은 store 내부에서 id/updatedAt 만 알면 충분하다
 * (엔진이 idOf/versionOf 만 요구). 구체 타입은 commit 빌더(2b-T4)의 몫.
 */
export interface WorkingCopyRow {
  id: string;
  updatedAt?: string | null;
  [key: string]: unknown;
}

/**
 * 캔버스 배치(draw) 입력 — 신규 설비 stage 의 최소 계약.
 * 별도 뷰모델에 의존하지 않고 stage 에 필요한 필드만 받는다.
 */
export interface PlacementDraw {
  id: string;
  kind: EquipmentKind;
  name: string;
  floorId: string | null;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  rotation?: number;
  totalU?: number | null;
  properties?: Record<string, unknown> | null;
}

type Cable = WorkingCopyRow;

/** 컬렉션 공통 descriptor 빌더 — id/updatedAt 키 규약은 전 컬렉션 동일. */
function makeDescriptor<T extends { id: string; updatedAt?: string | null }>(): CollectionDescriptor<T> {
  return {
    idOf: (x) => x.id,
    versionOf: (x) => x.updatedAt ?? null,
  };
}

// 효과(effective) 병합용 descriptor — 2c React 바인딩 훅(hooks.ts)이 재사용한다.
export const assetDescriptor = makeDescriptor<Asset>();
export const cableDescriptor = makeDescriptor<Cable>();

// ── 컬렉션 레지스트리 (북극성 ① 코어 제네릭화) ──────────────────────────────────
// 워킹카피 컬렉션을 '데이터'로 등록한다. dirty/revert(freshOverlays) 등 종류-무관 기계는
// 이 레지스트리를 *순회*하므로, 새 컬렉션 추가 = 여기 한 줄 → dirty/revert 에 자동 참여
// (엔티티마다 dirty 합산·revert 분기를 손대던 보일러플레이트 제거).
/**
 * 자산 하위레코드(점검/고장이력/사진 + 미래 종류)의 단일 제네릭 표현. 점검·고장이력·사진은
 * 자산의 *속성*이므로 형제 컬렉션이 아니라 **하나의 records 컬렉션**으로 두고 `recordType` 으로
 * 구분한다. 새 레코드 종류 추가 = recordTypes.ts(ASSET_RECORD_TYPES) 데이터 한 줄 — 전용
 * 컬렉션/오버레이/훅/flush 함수는 0개. saved(영속)는 워킹카피 endpoint 가 각 자산 안에
 * records[] 로 중첩해 주고(buildSaved 가 평탄화), overlay 가 staging(create/update/delete)을 담는다.
 *
 * 종류별 필드(inspections: inspectionDate/inspector/content; logs: logType/title/logDate/severity;
 * photos: side/imageUrl + staged 시 file/objectUrl)는 [k] 로 자유. 단일 출처는 recordTypes.ts.
 */
export interface AssetRecord {
  id: string;
  assetId: string;
  recordType: RecordTypeKey;
  updatedAt?: string | null;
  createdByName?: string | null;
  [k: string]: unknown;
}

// 자산 하위레코드는 단일 records 컬렉션 — 종류는 recordType 데이터로 구분(전용 descriptor 없음).
const recordsDescriptor = makeDescriptor<AssetRecord>();
export { recordsDescriptor };

// 조직 4컬렉션 descriptor — loadOrgTree 로 한 번 전역 로드, effective/dirty 엔진 공통 사용.
export const headquartersDescriptor = makeDescriptor<OrgHeadquarters>();
export const branchDescriptor = makeDescriptor<OrgBranch>();
export const orgSubstationDescriptor = makeDescriptor<OrgSubstation>();
export const floorDescriptor = makeDescriptor<OrgFloor>();

const COLLECTIONS = {
  assets: assetDescriptor,
  cables: cableDescriptor,
  records: recordsDescriptor,
  headquarters: headquartersDescriptor,
  branches: branchDescriptor,
  substations: orgSubstationDescriptor,
  floors: floorDescriptor,
};
export type CollectionKey = keyof typeof COLLECTIONS;
export const COLLECTION_KEYS = Object.keys(COLLECTIONS) as CollectionKey[];
type AnyDescriptor = CollectionDescriptor<{ id: string; updatedAt?: string | null }>;

/** 전 컬렉션 staged 변경 합계 — dirty 의 단일 소스(레지스트리 순회). store/hook/non-hook 모두 이걸 쓴다. */
export function sumOverlaysDirty(overlays: Overlays): number {
  const o = overlays as unknown as Record<CollectionKey, Overlay<unknown, unknown>>;
  return COLLECTION_KEYS.reduce((sum, k) => sum + overlayDirtyCount(o[k]), 0);
}

interface SavedCollections {
  assets: Asset[];
  cables: Cable[];
  records: AssetRecord[]; // 워킹카피가 각 자산 안에 중첩해 반환 → buildSaved 가 평탄화
  // 조직 4컬렉션 — loadOrgTree 로 전역 로드(per-substation load 와 무관).
  headquarters: OrgHeadquarters[];
  branches: OrgBranch[];
  substations: OrgSubstation[];
  floors: OrgFloor[];
}

interface Overlays {
  assets: Overlay<Asset, Partial<Asset>>;
  cables: Overlay<Cable, Partial<Cable>>;
  records: Overlay<AssetRecord, Partial<AssetRecord>>;
  headquarters: Overlay<OrgHeadquarters, Partial<OrgHeadquarters>>;
  branches: Overlay<OrgBranch, Partial<OrgBranch>>;
  substations: Overlay<OrgSubstation, Partial<OrgSubstation>>;
  floors: Overlay<OrgFloor, Partial<OrgFloor>>;
}

/**
 * 워킹카피 응답(raw)에서 saved 컬렉션을 구성한다. 자산 하위레코드는 각 자산 안에 records[] 로
 * 중첩돼 오므로(자산이 자기 레코드를 소유), 여기서 평탄화해 단일 records 컬렉션으로 만든다.
 */
function buildSaved(raw: Record<string, unknown>): SavedCollections {
  const rawAssets = (raw.assets as Array<Asset & { records?: AssetRecord[] }>) ?? [];
  const assets: Asset[] = [];
  const records: AssetRecord[] = [];
  for (const a of rawAssets) {
    const { records: rs, ...rest } = a;
    assets.push(rest as Asset);
    if (rs && rs.length) records.push(...rs);
  }
  return {
    assets,
    cables: (raw.cables as Cable[]) ?? [],
    records,
    // 조직 4컬렉션은 per-substation 워킹카피 payload 에 없다 → 기본 []. loadOrgTree 로 전역 채움.
    // (per-substation load 의 mergeSavedById 가 기존 org saved 를 보존하므로 여기 []는 incoming 으로만 쓰임.)
    headquarters: (raw.headquarters as OrgHeadquarters[]) ?? [],
    branches: (raw.branches as OrgBranch[]) ?? [],
    substations: (raw.substations as OrgSubstation[]) ?? [],
    floors: (raw.floors as OrgFloor[]) ?? [],
  };
}

const emptySaved = (): SavedCollections => buildSaved({});

/** staged 사진(records 중 recordType==='photos')의 blob objectUrl 을 해제 — 커밋/되돌리기 시(누수 방지). */
export function revokeStagedPhotoUrls(overlays: Overlays): void {
  for (const r of Object.values(overlays.records.creates)) {
    if (r.recordType === PHOTOS && typeof r.objectUrl === 'string') URL.revokeObjectURL(r.objectUrl);
  }
}

/** saved 컬렉션에서 baseVersions 까지 채운 빈 overlay 세트를 만든다(레지스트리 순회). */
function freshOverlays(saved: SavedCollections): Overlays {
  const out: Record<string, unknown> = {};
  for (const key of COLLECTION_KEYS) {
    const desc = COLLECTIONS[key] as unknown as AnyDescriptor;
    const rows = saved[key] as { id: string; updatedAt?: string | null }[];
    out[key] = {
      ...emptyOverlay(),
      baseVersions: snapshotBaseVersions(rows, desc.idOf, desc.versionOf),
    };
  }
  return out as unknown as Overlays;
}

/**
 * 전역 워킹카피: 새로 로드한 변전소 saved 를 기존 saved 에 병합한다(다른 변전소로 이동해도 누적).
 *
 * **변전소 S 재로드는 S 스코프에 대해 incoming 이 권위다** — 그래서 incoming(=DB 의 현재 S 셋)에
 * 없는 *S 소속* prev 항목은 **삭제된 것으로 보고 드롭**한다. 이게 없으면 순수 합집합이라 삭제된
 * 자산/케이블이 saved 에 영구히 남아, 커밋 후 overlay 를 비우면 되살아난다(새로고침해야 사라지는 버그).
 * 타 변전소 항목은 S 스코프가 아니므로 보존(전역 누적 유지).
 *
 * S 스코프 판정: 자산=substationId, 케이블=양 끝점 중 하나가 S 자산, 레코드=소속 자산(assetId)이 S.
 */
function mergeSavedById(
  prev: SavedCollections,
  incoming: SavedCollections,
  substationId: string,
): SavedCollections {
  // S 소속 자산 id(삭제된 것 포함 — prev 의 S 자산 + incoming 자산). 케이블/레코드 스코프 판정용.
  const sAssetIds = new Set<string>();
  for (const a of prev.assets as Asset[]) if (a.substationId === substationId) sAssetIds.add(a.id);
  for (const a of incoming.assets as Asset[]) sAssetIds.add(a.id);

  const inScope = (key: CollectionKey, r: { id: string }): boolean => {
    if (key === 'assets') return (r as Asset).substationId === substationId;
    if (key === 'cables') {
      const c = r as unknown as { sourceAssetId?: string | null; targetAssetId?: string | null };
      return (!!c.sourceAssetId && sAssetIds.has(c.sourceAssetId)) || (!!c.targetAssetId && sAssetIds.has(c.targetAssetId));
    }
    // 조직 4컬렉션은 per-substation 스코프가 아니라 전역(loadOrgTree). per-substation load 의
    // incoming 엔 없으므로 절대 S 스코프로 판정하지 않는다 → 항상 보존(드롭 금지).
    if (key === 'headquarters' || key === 'branches' || key === 'substations' || key === 'floors') return false;
    const rec = r as unknown as { assetId?: string | null };
    return !!rec.assetId && sAssetIds.has(rec.assetId);
  };

  const out: Record<string, unknown> = {};
  for (const key of COLLECTION_KEYS) {
    const desc = COLLECTIONS[key] as unknown as AnyDescriptor;
    const incomingById = new Map<string, { id: string }>();
    for (const r of incoming[key] as { id: string }[]) incomingById.set(desc.idOf(r as never), r);
    const byId = new Map<string, { id: string }>();
    for (const r of prev[key] as { id: string }[]) {
      const id = desc.idOf(r as never);
      if (incomingById.has(id)) continue;       // incoming 이 권위 — 아래에서 일괄 추가
      if (inScope(key, r)) continue;            // S 스코프인데 incoming 에 없음 = 삭제 → 드롭
      byId.set(id, r);                          // 타 변전소 → 보존
    }
    for (const [id, r] of incomingById) byId.set(id, r); // incoming 권위(추가/갱신)
    out[key] = [...byId.values()];
  }
  return out as unknown as SavedCollections;
}

/** staged overlay(creates/updates/deletes)는 보존하고, 새로 로드한 saved 의 baseVersions 만 합친다(전역). */
function addBaseVersions(overlays: Overlays, incoming: SavedCollections): Overlays {
  const out: Record<string, unknown> = {};
  const o = overlays as unknown as Record<CollectionKey, Overlay<{ id: string; updatedAt?: string | null }, unknown>>;
  for (const key of COLLECTION_KEYS) {
    const desc = COLLECTIONS[key] as unknown as AnyDescriptor;
    const rows = incoming[key] as { id: string; updatedAt?: string | null }[];
    out[key] = { ...o[key], baseVersions: { ...o[key].baseVersions, ...snapshotBaseVersions(rows, desc.idOf, desc.versionOf) } };
  }
  return out as unknown as Overlays;
}

export interface SubstationWorkingCopyState {
  substationId: string | null;
  saved: SavedCollections;
  overlays: Overlays;

  // ── lifecycle ──
  load: (substationId: string) => Promise<void>;
  /** 조직트리 전체(평면)를 전역 saved 로 1회 로드. per-substation load 와 독립. staged org overlay 는 보존. */
  loadOrgTree: () => Promise<void>;
  /** 409 후 재로드: saved/baseVersions 만 최신화하고 staged overlay 는 보존. */
  refreshBaseVersions: (substationId: string) => Promise<void>;
  revert: () => void;
  /** 전역 워킹카피 전체 초기화(로그아웃/전환 등) — saved·overlay·undo 히스토리 모두 비움. */
  reset: () => void;

  // ── stage actions ──
  stageAssetCreate: (item: Asset) => void;
  stageAssetUpdate: (id: string, patch: Partial<Asset>) => void;
  stageAssetDelete: (id: string) => void;
  stageCableCreate: (item: Cable) => void;
  stageCableUpdate: (id: string, patch: Partial<Cable>) => void;
  stageCableDelete: (id: string) => void;

  // ── 제네릭 ops (북극성 ① — 컬렉션 키로 stage. 새 엔티티는 이걸 쓰면 전용 함수 0개) ──
  put: (coll: CollectionKey, item: { id: string; [k: string]: unknown }) => void;
  patch: (coll: CollectionKey, id: string, fields: Record<string, unknown>) => void;
  remove: (coll: CollectionKey, id: string) => void;

  // ── editor-facing mutation actions (2d-1 T3) ──
  // 캔버스 배치(draw) 입력을 받아 Asset overlay 로 stage 한다.
  // 복합/배치 액션은 단일 set → zundo 1 entry(undo 1스텝).
  /**
   * 설비 신규 stage. assetTypeId 는 kind→assetType 해석(2d-2)에서 주입.
   * floorId 는 PlacementDraw 본체에 담아 전달한다(에디터가 보유).
   */
  stageEquipmentCreate: (eq: PlacementDraw, assetTypeId: string) => void;
  /** 설비 삭제 + 랙모듈 자식 + 해당 설비/모듈에 닿는 케이블까지 캐스케이드(단일 set). */
  stageEquipmentDeleteCascade: (id: string) => void;
  /** 케이블 다건 업데이트를 단일 set 으로 stage(단일 undo). */
  stageCableUpdates: (updates: Record<string, Partial<Cable>>) => void;

  // ── 랙모듈(=RACK 자식 Asset) stage 액션 — assets overlay 에 위임. ──
  /** 랙모듈 신규 stage. floorId 는 부모 랙 Asset 에서 상속(없으면 null). */
  stageRackModuleCreate: (m: RackModuleDraw) => void;
  stageRackModuleDelete: (id: string) => void;

  // ── effective selectors (getState() 로 호출 가능한 plain method) ──
  effectiveAssets: () => Asset[];
  effectiveTopAssets: () => Asset[];
  effectiveAssetsByFloor: (floorId: string) => Asset[];
  effectiveEquipment: (floorId: string) => Asset[];
  effectiveRackModules: (rackId: string) => Asset[];
  effectiveCables: () => Cable[];
  effectiveHeadquarters: () => OrgHeadquarters[];
  effectiveBranches: () => OrgBranch[];
  effectiveSubstations: () => OrgSubstation[];
  effectiveFloors: () => OrgFloor[];

  dirtyCount: () => number;
}

/** undo/redo history 에 담는 슬라이스 — overlays 만(saved/substationId 제외). */
type HistorySlice = Pick<SubstationWorkingCopyState, 'overlays'>;

// 빠른 변전소 전환(S1→S2) 시 늦게 도착한 S1 응답이 S2 데이터를 덮어쓰지
// 않도록 하는 monotonic 가드. load 마다 ++loadSeq 후, 응답 처리 직전에
// 자신의 seq 가 최신인지 확인한다(아니면 폐기).
let loadSeq = 0;


export const useSubstationWorkingCopy = create<SubstationWorkingCopyState>()(
  temporal<SubstationWorkingCopyState, [], [], HistorySlice>(
    (set, get) => ({
      substationId: null,
      saved: emptySaved(),
      overlays: freshOverlays(emptySaved()),

      load: async (substationId) => {
        const seq = ++loadSeq;
        const { data } = await api.get(`/substations/${substationId}/workingcopy`);
        if (seq !== loadSeq) return; // 더 최신 load 가 시작됨 → 폐기
        const incoming = buildSaved(data.data);
        // 전역 워킹카피: saved 누적 병합 + 기존 staged overlay/히스토리 보존(변전소 이동해도 안 비움).
        // → 변전소 A 자산 편집 후 B 로 이동해 B 자산 편집, 한 번에 커밋(POST /commit) 가능.
        // load 는 사용자 편집이 아니므로 undo 히스토리에 기록하지 않는다(temporal pause).
        const t = useSubstationWorkingCopy.temporal.getState();
        t.pause();
        set((s) => ({
          substationId,
          saved: mergeSavedById(s.saved, incoming, substationId),
          overlays: addBaseVersions(s.overlays, incoming),
        }));
        t.resume();
      },

      loadOrgTree: async () => {
        const t = await organizationApi.getTree();
        // 조직 saved 를 권위로 교체하고, 조직 overlay 의 baseVersions 만 새 행으로 갱신한다.
        // staged creates/updates/deletes 는 보존(전역 1회 로드 후 편집 진행 가능) — load 와 동일하게 비기록.
        const tt = useSubstationWorkingCopy.temporal.getState();
        tt.pause();
        set((s) => {
          const orgIncoming: Pick<SavedCollections, 'headquarters' | 'branches' | 'substations' | 'floors'> = {
            headquarters: t.headquarters,
            branches: t.branches,
            substations: t.substations,
            floors: t.floors,
          };
          const refreshOverlay = <T extends { id: string; updatedAt?: string | null }>(
            ov: Overlay<T, Partial<T>>,
            rows: T[],
            desc: CollectionDescriptor<T>,
          ): Overlay<T, Partial<T>> => ({
            ...ov,
            baseVersions: snapshotBaseVersions(rows, desc.idOf, desc.versionOf),
          });
          return {
            saved: { ...s.saved, ...orgIncoming },
            overlays: {
              ...s.overlays,
              headquarters: refreshOverlay(s.overlays.headquarters, t.headquarters, headquartersDescriptor),
              branches: refreshOverlay(s.overlays.branches, t.branches, branchDescriptor),
              substations: refreshOverlay(s.overlays.substations, t.substations, orgSubstationDescriptor),
              floors: refreshOverlay(s.overlays.floors, t.floors, floorDescriptor),
            },
          };
        });
        tt.resume();
      },

      refreshBaseVersions: async (substationId) => {
        const seq = ++loadSeq;
        const { data } = await api.get(`/substations/${substationId}/workingcopy`);
        if (seq !== loadSeq) return; // 더 최신 load/refresh 가 시작됨 → 폐기
        const incoming = buildSaved(data.data);
        // 409 후: staged overlay 는 보존하고, 이 변전소 saved/baseVersions 만 최신으로 병합(전역 누적).
        const t = useSubstationWorkingCopy.temporal.getState();
        t.pause();
        set((s) => ({
          substationId,
          saved: mergeSavedById(s.saved, incoming, substationId),
          overlays: addBaseVersions(s.overlays, incoming),
        }));
        t.resume();
      },

      revert: () => set((s) => ({ overlays: freshOverlays(s.saved) })),

      reset: () => {
        set({ substationId: null, saved: emptySaved(), overlays: freshOverlays(emptySaved()) });
        useSubstationWorkingCopy.temporal.getState().clear();
      },

      stageAssetCreate: (item) =>
        set((s) => ({ overlays: { ...s.overlays, assets: stageCreate(s.overlays.assets, item.id, item) } })),
      stageAssetUpdate: (id, patch) =>
        set((s) => ({ overlays: { ...s.overlays, assets: stageUpdate(s.overlays.assets, id, patch) } })),
      stageAssetDelete: (id) =>
        set((s) => ({ overlays: { ...s.overlays, assets: stageDelete(s.overlays.assets, id, isTempId(id)) } })),

      stageCableCreate: (item) =>
        set((s) => ({ overlays: { ...s.overlays, cables: stageCreate(s.overlays.cables, item.id, item) } })),
      stageCableUpdate: (id, patch) =>
        set((s) => ({ overlays: { ...s.overlays, cables: stageUpdate(s.overlays.cables, id, patch) } })),
      stageCableDelete: (id) =>
        set((s) => ({ overlays: { ...s.overlays, cables: stageDelete(s.overlays.cables, id, isTempId(id)) } })),

      // 제네릭 ops — 컬렉션 키로 overlay 에 stage(엔티티 무관). overlay 는 키마다 타입이 달라 loose cast.
      put: (coll, item) =>
        set((s) => {
          const o = s.overlays as unknown as Record<CollectionKey, Overlay<{ id: string }, unknown>>;
          return { overlays: { ...s.overlays, [coll]: stageCreate(o[coll], item.id, item) } };
        }),
      patch: (coll, id, fields) =>
        set((s) => {
          const o = s.overlays as unknown as Record<CollectionKey, Overlay<{ id: string }, unknown>>;
          return { overlays: { ...s.overlays, [coll]: stageUpdate(o[coll], id, fields) } };
        }),
      remove: (coll, id) =>
        set((s) => {
          const o = s.overlays as unknown as Record<CollectionKey, Overlay<{ id: string }, unknown>>;
          return { overlays: { ...s.overlays, [coll]: stageDelete(o[coll], id, isTempId(id)) } };
        }),

      // ── editor-facing mutation actions (2d-1 T3) ──
      stageEquipmentCreate: (eq, assetTypeId) =>
        set((s) => {
          if (!s.substationId) return s; // 미로드 — 무시(null substationId asset 방지)
          // 캔버스 draw 입력 → staged Asset(과거 equipmentToAssetCreate 를 인라인).
          // staged create — 실제 assetType 은 서버 커밋 후에야 알 수 있어 placementKind 만 채운다.
          const asset: Asset = {
            id: eq.id,
            substationId: s.substationId,
            assetTypeId,
            assetType: { placementKind: eq.kind } as Asset['assetType'],
            name: eq.name,
            parentAssetId: null,
            floorId: eq.floorId,
            roomText: null,
            positionX: eq.positionX,
            positionY: eq.positionY,
            width2d: eq.width,
            height2d: eq.height,
            rotation: eq.rotation ?? 0,
            totalU: eq.totalU ?? null,
            slotIndex: null,
            slotSpan: null,
            description: null,
            manager: null,
            installDate: null,
            status: null,
            warrantyUntil: null,
            replaceDue: null,
            // 랙 프리셋 추적: FE 캐리어 properties.sourcePresetId → Asset 전용 컬럼(#7).
            sourcePresetId: (eq.properties as { sourcePresetId?: string } | null | undefined)?.sourcePresetId ?? null,
            sortOrder: 0,
            updatedAt: '',
          };
          return { overlays: { ...s.overlays, assets: stageCreate(s.overlays.assets, asset.id, asset) } };
        }),

      stageEquipmentDeleteCascade: (id) =>
        set((s) => {
          const effA = mergeEffective(s.saved.assets, s.overlays.assets, assetDescriptor);
          const effC = mergeEffective(s.saved.cables, s.overlays.cables, cableDescriptor);
          // 랙모듈 자식(isRackModuleChild: parentAssetId === id && slotIndex != null) 까지 캐스케이드 대상.
          const childIds = effA
            .filter((a) => a.parentAssetId === id && isRackModuleChild(a))
            .map((a) => a.id);
          const targets = new Set<string>([id, ...childIds]);
          let assets = s.overlays.assets;
          for (const tid of [id, ...childIds]) assets = stageDelete(assets, tid, isTempId(tid));

          // 단계4b — endpoint 는 단일 assetId. 케이블 endpoint asset(또는 그 containment
          //   조상: 모듈→랙, 분기→피더→분전반)이 삭제 대상이면 케이블도 함께 삭제한다.
          //   DB 도 source_asset_id ON DELETE CASCADE 로 동일하게 정리되지만, 워킹카피
          //   에서 미리 staged delete 로 반영해 UI 가 즉시 일관되게 한다.
          const assetsById = toMapById(effA);
          const endpointHitsTarget = (assetId: string | null | undefined): boolean => {
            let cur = assetId ? assetsById.get(assetId) : undefined;
            // 미머지 endpoint(예: saved 에만 있는 id) 라도 자기 자신 직접 일치는 잡는다.
            if (assetId && targets.has(assetId)) return true;
            let hops = 0;
            while (cur && hops < 8) {
              if (targets.has(cur.id)) return true;
              if (cur.parentAssetId == null) return false;
              cur = assetsById.get(cur.parentAssetId);
              hops++;
            }
            return false;
          };
          let cables = s.overlays.cables;
          for (const c of effC) {
            const srcId = (c as { sourceAssetId?: string | null }).sourceAssetId;
            const tgtId = (c as { targetAssetId?: string | null }).targetAssetId;
            if (endpointHitsTarget(srcId) || endpointHitsTarget(tgtId)) {
              cables = stageDelete(cables, c.id, isTempId(c.id));
            }
          }
          return { overlays: { ...s.overlays, assets, cables } };
        }),

      stageCableUpdates: (updates) =>
        set((s) => {
          let cables = s.overlays.cables;
          for (const [id, patch] of Object.entries(updates)) cables = stageUpdate(cables, id, patch);
          return { overlays: { ...s.overlays, cables } };
        }),

      // ── 랙모듈 stage 액션 (assets overlay 위임) ──
      stageRackModuleCreate: (m) =>
        set((s) => {
          if (!s.substationId) return s; // 미로드 — 무시(null substationId asset 방지)
          // floorId 는 부모 랙 Asset 의 floorId 를 상속(effective 에서 조회, 없으면 null).
          const parent = mergeEffective(s.saved.assets, s.overlays.assets, assetDescriptor)
            .find((a) => a.id === m.rackEquipmentId);
          // 랙모듈은 별도 컬렉션이 아니라 ASSETS 의 RACK 자식 Asset(parentAssetId +
          // slotIndex + slotSpan). 배치 좌표/totalU 는 랙모듈에 없어 null.
          const asset: Asset = {
            id: m.id,
            substationId: s.substationId,
            assetTypeId: m.categoryId,
            // staged create — 실제 assetType 은 서버 커밋 후에야 안다. 랙모듈은 배치형 아님.
            assetType: { placementKind: null } as Asset['assetType'],
            name: m.name,
            parentAssetId: m.rackEquipmentId,
            floorId: parent?.floorId ?? null,
            roomText: null,
            positionX: null,
            positionY: null,
            width2d: null,
            height2d: null,
            rotation: 0,
            totalU: null,
            slotIndex: m.slotIndex,
            slotSpan: m.slotSpan,
            description: m.description ?? null,
            manager: m.manager ?? null,
            installDate: m.installDate ?? null,
            status: null,
            warrantyUntil: null,
            replaceDue: null,
            sourcePresetId:
              (m.properties as { sourcePresetId?: string } | null | undefined)?.sourcePresetId ?? null,
            sortOrder: m.sortOrder ?? 0,
            updatedAt: '',
          };
          return { overlays: { ...s.overlays, assets: stageCreate(s.overlays.assets, asset.id, asset) } };
        }),

      stageRackModuleDelete: (id) =>
        set((s) => ({ overlays: { ...s.overlays, assets: stageDelete(s.overlays.assets, id, isTempId(id)) } })),

      effectiveAssets: () => {
        const s = get();
        return mergeEffective(s.saved.assets, s.overlays.assets, assetDescriptor);
      },
      effectiveTopAssets: () => get().effectiveAssets().filter((a) => !isRackModuleChild(a)),
      effectiveAssetsByFloor: (floorId) => get().effectiveTopAssets().filter((a) => a.floorId === floorId),
      effectiveEquipment: (floorId) => get().effectiveAssetsByFloor(floorId),
      effectiveRackModules: (rackId) =>
        get().effectiveAssets().filter((a) => isRackModuleChild(a) && a.parentAssetId === rackId),
      effectiveCables: () => {
        const s = get();
        return mergeEffective(s.saved.cables, s.overlays.cables, cableDescriptor);
      },
      effectiveHeadquarters: () => {
        const s = get();
        return mergeEffective(s.saved.headquarters, s.overlays.headquarters, headquartersDescriptor);
      },
      effectiveBranches: () => {
        const s = get();
        return mergeEffective(s.saved.branches, s.overlays.branches, branchDescriptor);
      },
      effectiveSubstations: () => {
        const s = get();
        return mergeEffective(s.saved.substations, s.overlays.substations, orgSubstationDescriptor);
      },
      effectiveFloors: () => {
        const s = get();
        return mergeEffective(s.saved.floors, s.overlays.floors, floorDescriptor);
      },

      dirtyCount: () => {
        return sumOverlaysDirty(get().overlays);
      },
    }),
    {
      // history 에는 overlays 만 담는다 — saved/effective 는 파생값이라 제외.
      partialize: (state): HistorySlice => ({ overlays: state.overlays }),
      equality: shallow,
      limit: 50,
    },
  ),
);
