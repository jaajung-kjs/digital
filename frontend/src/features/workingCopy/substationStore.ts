import { create } from 'zustand';
import { temporal } from 'zundo';
import { shallow } from 'zustand/shallow';
import { api } from '../../utils/api';
import { isTempId } from '../../utils/idHelpers';
import type { Asset } from '../../types/asset';
import type { FloorPlanEquipment } from '../../types/floorPlan';
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
import { assetToEquipment } from './assetToEquipment';
import { equipmentToAssetCreate, equipmentToAssetPatch } from './equipmentToAsset';
import { rackModuleToAssetCreate, rackModuleToAssetPatch } from './rackModuleToAsset';
import { assetsByIdMap, cableOnFloor } from './floorAnchor';
import { isRackModuleAsset as isRackModuleChild } from './assetClassify';
import type { RackModule } from '../../types/rackModule';

// ──────────────────────────────────────────────────────────────────────────
// SSOT-2b Task 3 — substation-scoped Unit-of-Work.
//
// 한 변전소의 working copy 전체(assets / cables / fiberPaths)를 단일 store 에
// 담는다(단계3b 에서 분전 회로는 FEEDER/BRANCH asset 으로 흡수). 각 컬렉션은 Lv1 엔진(overlay/effective/
// descriptor)을 그대로 재사용하고, undo/redo 는 zundo `temporal` 로 overlays
// 슬라이스만 history 에 담아 제공한다. 효과(effective) 셀렉터는 getState()로
// 호출 가능한 plain method 로 둔다 — React 메모이즈 hook 은 2c/2d 의 몫.
// ──────────────────────────────────────────────────────────────────────────

/**
 * cables / fiberPaths row 의 최소 계약.
 * 배치 Asset 외 컬렉션은 store 내부에서 id/updatedAt 만 알면 충분하다
 * (엔진이 idOf/versionOf 만 요구). 구체 타입은 commit 빌더(2b-T4)의 몫.
 */
export interface WorkingCopyRow {
  id: string;
  updatedAt?: string | null;
  [key: string]: unknown;
}

type Cable = WorkingCopyRow;
type FiberPath = WorkingCopyRow;

/** 컬렉션 공통 descriptor 빌더 — id/updatedAt 키 규약은 전 컬렉션 동일. */
function makeDescriptor<T extends { id: string; updatedAt?: string | null }>(
  name: string,
): CollectionDescriptor<T, Partial<T>> {
  return {
    name,
    idOf: (x) => x.id,
    versionOf: (x) => x.updatedAt ?? null,
    isTemp: isTempId,
    applyPatch: (x, p) => ({ ...x, ...p }),
  };
}

// 효과(effective) 병합용 descriptor — 2c React 바인딩 훅(hooks.ts)이 재사용한다.
export const assetDescriptor = makeDescriptor<Asset>('assets');
export const cableDescriptor = makeDescriptor<Cable>('cables');
export const fiberPathDescriptor = makeDescriptor<FiberPath>('fiberPaths');

// ── 컬렉션 레지스트리 (북극성 ① 코어 제네릭화) ──────────────────────────────────
// 워킹카피 컬렉션을 '데이터'로 등록한다. dirty/revert(freshOverlays) 등 종류-무관 기계는
// 이 레지스트리를 *순회*하므로, 새 컬렉션 추가 = 여기 한 줄 → dirty/revert 에 자동 참여
// (엔티티마다 dirty 합산·revert 분기를 손대던 보일러플레이트 제거).
/**
 * 점검(inspection) 컬렉션 레코드. 점검의 '저장된' 데이터는 변전소 워킹카피 endpoint 에 없고
 * 자산별 React Query(useInspectionLogs)로 로드되므로, store 의 saved.inspections 는 항상 []
 * (실 saved 는 RQ). overlay 만 staging(create/update/delete) — 단일 워킹카피의 dirty/revert/
 * commit 에 다른 컬렉션과 동일하게 참여한다(북극성 ①). 컴포넌트가 RQ(saved)+overlay 를 머지.
 */
export interface InspectionRow {
  id: string;
  assetId: string;
  inspectionDate: string;
  inspector: string;
  content?: string | null;
  updatedAt?: string | null;
}
export const inspectionDescriptor = makeDescriptor<InspectionRow>('inspections');

/** 고장이력(maintenance log) staged 레코드. inspections 와 동일 — saved 는 [](RQ), overlay 만 staging. */
export interface LogRow {
  id: string;
  equipmentId: string;
  logType: string;
  title: string;
  description?: string | null;
  logDate?: string | null;
  severity?: string | null;
  updatedAt?: string | null;
}
export const logDescriptor = makeDescriptor<LogRow>('logs');

const COLLECTIONS = {
  assets: assetDescriptor,
  cables: cableDescriptor,
  fiberPaths: fiberPathDescriptor,
  inspections: inspectionDescriptor,
  logs: logDescriptor,
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
  fiberPaths: FiberPath[];
  inspections: InspectionRow[]; // 항상 [] — 실 saved 는 RQ(useInspectionLogs)
  logs: LogRow[]; // 항상 [] — 실 saved 는 RQ(useMaintenanceLogs)
}

interface Overlays {
  assets: Overlay<Asset, Partial<Asset>>;
  cables: Overlay<Cable, Partial<Cable>>;
  fiberPaths: Overlay<FiberPath, Partial<FiberPath>>;
  inspections: Overlay<InspectionRow, Partial<InspectionRow>>;
  logs: Overlay<LogRow, Partial<LogRow>>;
}

const emptySaved = (): SavedCollections => ({
  assets: [],
  cables: [],
  fiberPaths: [],
  inspections: [],
  logs: [],
});

/** saved 컬렉션에서 baseVersions 까지 채운 빈 overlay 세트를 만든다(레지스트리 순회). */
function freshOverlays(saved: SavedCollections): Overlays {
  const out: Record<string, unknown> = {};
  for (const key of COLLECTION_KEYS) {
    const desc = COLLECTIONS[key] as unknown as AnyDescriptor;
    const rows = saved[key] as { id: string; updatedAt?: string | null }[];
    out[key] = {
      ...emptyOverlay(),
      baseVersions: snapshotBaseVersions(rows, desc.idOf, desc.versionOf!),
    };
  }
  return out as unknown as Overlays;
}

export interface SubstationWorkingCopyState {
  substationId: string | null;
  saved: SavedCollections;
  overlays: Overlays;

  // ── lifecycle ──
  load: (substationId: string) => Promise<void>;
  /** 409 후 재로드: saved/baseVersions 만 최신화하고 staged overlay 는 보존. */
  refreshBaseVersions: (substationId: string) => Promise<void>;
  revert: () => void;

  // ── stage actions ──
  stageAssetCreate: (item: Asset) => void;
  stageAssetUpdate: (id: string, patch: Partial<Asset>) => void;
  stageAssetDelete: (id: string) => void;
  stageCableCreate: (item: Cable) => void;
  stageCableUpdate: (id: string, patch: Partial<Cable>) => void;
  stageCableDelete: (id: string) => void;
  stageFiberPathCreate: (item: FiberPath) => void;
  stageFiberPathUpdate: (id: string, patch: Partial<FiberPath>) => void;
  stageFiberPathDelete: (id: string) => void;

  // ── 제네릭 ops (북극성 ① — 컬렉션 키로 stage. 새 엔티티는 이걸 쓰면 전용 함수 0개) ──
  put: (coll: CollectionKey, item: { id: string; [k: string]: unknown }) => void;
  patch: (coll: CollectionKey, id: string, fields: Record<string, unknown>) => void;
  remove: (coll: CollectionKey, id: string) => void;

  // ── editor-facing mutation actions (2d-1 T3) ──
  // 캔버스 편집 결과(FloorPlanEquipment)를 받아 Asset overlay 로 stage 한다.
  // 복합/배치 액션은 단일 set → zundo 1 entry(undo 1스텝).
  /**
   * 설비 신규 stage. assetTypeId 는 kind→assetType 해석(2d-2)에서 주입.
   * floorId 는 FloorPlanEquipment 본체에 없으므로(에디터가 보유) eq 에 얹어 전달한다.
   */
  stageEquipmentCreate: (eq: FloorPlanEquipment & { floorId: string }, assetTypeId: string) => void;
  stageEquipmentUpdate: (id: string, eqPatch: Partial<FloorPlanEquipment>) => void;
  /** 설비 삭제 + 랙모듈 자식 + 해당 설비/모듈에 닿는 케이블까지 캐스케이드(단일 set). */
  stageEquipmentDeleteCascade: (id: string) => void;
  /** 케이블 다건 업데이트를 단일 set 으로 stage(단일 undo). */
  stageCableUpdates: (updates: Record<string, Partial<Cable>>) => void;

  /**
   * 버전 복원: 한 층의 현재 effective(assets/cables)를 snapshot 과 diff 하여
   * create/update/delete 를 단일 set 으로 stage 한다(단일 undo 스텝).
   * - snapshot 에 없는 현 floor asset/cable → delete
   * - snapshot 에만 있는 → create, 양쪽에 있는 → update(snapshot 필드로 교체)
   * 입력은 Asset[]/Cable[] 형태(audit-log snapshot 의 FloorPlanEquipment/cable shape 매핑은 호출측의 몫 — Task 4).
   */
  stageReplaceFloorFromSnapshot: (
    floorId: string,
    snapshot: { assets: Asset[]; cables: Cable[] },
  ) => void;

  // ── 랙모듈(=RACK 자식 Asset) stage 액션 — assets overlay 에 위임. ──
  /** 랙모듈 신규 stage. floorId 는 부모 랙 Asset 에서 상속(없으면 null). */
  stageRackModuleCreate: (m: RackModule) => void;
  stageRackModuleUpdate: (id: string, patch: Partial<RackModule>) => void;
  stageRackModuleDelete: (id: string) => void;

  // ── effective selectors (getState() 로 호출 가능한 plain method) ──
  effectiveAssets: () => Asset[];
  effectiveTopAssets: () => Asset[];
  effectiveAssetsByFloor: (floorId: string) => Asset[];
  effectiveEquipment: (floorId: string) => FloorPlanEquipment[];
  effectiveRackModules: (rackId: string) => Asset[];
  effectiveCables: () => Cable[];
  effectiveFiberPaths: () => FiberPath[];

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
        const saved: SavedCollections = {
          assets: data.data.assets ?? [],
          cables: data.data.cables ?? [],
          fiberPaths: data.data.fiberPaths ?? [],
          inspections: [],
          logs: [],
        };
        set({ substationId, saved, overlays: freshOverlays(saved) });
        // 다른 변전소 로드 시 이전 overlay 가 undo 로 복원되지 않도록 history 클리어.
        useSubstationWorkingCopy.temporal.getState().clear();
      },

      refreshBaseVersions: async (substationId) => {
        const seq = ++loadSeq;
        const { data } = await api.get(`/substations/${substationId}/workingcopy`);
        if (seq !== loadSeq) return; // 더 최신 load/refresh 가 시작됨 → 폐기
        const newSaved: SavedCollections = {
          assets: data.data.assets ?? [],
          cables: data.data.cables ?? [],
          fiberPaths: data.data.fiberPaths ?? [],
          inspections: [],
          logs: [],
        };
        // staged overlay(creates/updates/deletes)는 보존하고 baseVersions 만 최신 saved 기준으로 재스냅샷.
        set((s) => ({
          substationId,
          saved: newSaved,
          overlays: {
            assets: { ...s.overlays.assets, baseVersions: snapshotBaseVersions(newSaved.assets, assetDescriptor.idOf, assetDescriptor.versionOf!) },
            cables: { ...s.overlays.cables, baseVersions: snapshotBaseVersions(newSaved.cables, cableDescriptor.idOf, cableDescriptor.versionOf!) },
            fiberPaths: { ...s.overlays.fiberPaths, baseVersions: snapshotBaseVersions(newSaved.fiberPaths, fiberPathDescriptor.idOf, fiberPathDescriptor.versionOf!) },
            inspections: s.overlays.inspections, // saved 가 [] 이라 baseVersions 재스냅샷 불필요 — staged 보존만.
            logs: s.overlays.logs,
          },
        }));
      },

      revert: () => set((s) => ({ overlays: freshOverlays(s.saved) })),

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

      stageFiberPathCreate: (item) =>
        set((s) => ({ overlays: { ...s.overlays, fiberPaths: stageCreate(s.overlays.fiberPaths, item.id, item) } })),
      stageFiberPathUpdate: (id, patch) =>
        set((s) => ({ overlays: { ...s.overlays, fiberPaths: stageUpdate(s.overlays.fiberPaths, id, patch) } })),
      stageFiberPathDelete: (id) =>
        set((s) => ({ overlays: { ...s.overlays, fiberPaths: stageDelete(s.overlays.fiberPaths, id, isTempId(id)) } })),

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
          const asset = equipmentToAssetCreate(eq, {
            substationId: s.substationId,
            floorId: eq.floorId,
            assetTypeId,
            tempId: eq.id,
          });
          return { overlays: { ...s.overlays, assets: stageCreate(s.overlays.assets, asset.id, asset) } };
        }),

      stageEquipmentUpdate: (id, eqPatch) =>
        set((s) => ({
          overlays: { ...s.overlays, assets: stageUpdate(s.overlays.assets, id, equipmentToAssetPatch(eqPatch)) },
        })),

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
          const assetsById = assetsByIdMap(effA);
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

      stageReplaceFloorFromSnapshot: (floorId, snapshot) =>
        set((s) => {
          // 전 effective assets — floorAnchor 가 parent 체인을 거슬러 올라가려면 이 floor
          // 자산만이 아니라 부모(랙/분전반/피더)까지 다 보여야 한다.
          const allEffA = mergeEffective(s.saved.assets, s.overlays.assets, assetDescriptor);
          // 현 floor 의 effective assets — top/모듈 모두 floorId 로 식별(랙모듈도 floorId 상속).
          const effA = allEffA.filter((a) => a.floorId === floorId);
          // 단계3a — floor cables = 단일 endpoint assetId 를 floorAnchor 로 해소해 이 층에
          // 닿는 케이블. branch endpoint 는 branch→feeder→panel 으로 해소되어 회로
          // 특수처리(distributionEquipmentId 증강) 불필요. useEffectiveFloorCables 와 동일.
          const assetsById = assetsByIdMap(allEffA);
          const effC = mergeEffective(s.saved.cables, s.overlays.cables, cableDescriptor).filter((c) =>
            cableOnFloor(c as unknown as Parameters<typeof cableOnFloor>[0], floorId, assetsById),
          );

          let assets = s.overlays.assets;
          let cables = s.overlays.cables;

          const snapAIds = new Set(snapshot.assets.map((a) => a.id));
          const curA = new Map(effA.map((a) => [a.id, a]));
          for (const a of effA) if (!snapAIds.has(a.id)) assets = stageDelete(assets, a.id, isTempId(a.id));
          for (const a of snapshot.assets) {
            if (!curA.has(a.id)) assets = stageCreate(assets, a.id, a);
            else assets = stageUpdate(assets, a.id, a as Partial<Asset>); // snapshot 필드로 교체
          }

          const snapCIds = new Set(snapshot.cables.map((c) => c.id));
          const curC = new Map(effC.map((c) => [c.id, c]));
          for (const c of effC) if (!snapCIds.has(c.id)) cables = stageDelete(cables, c.id, isTempId(c.id));
          for (const c of snapshot.cables) {
            if (!curC.has(c.id)) cables = stageCreate(cables, c.id, c);
            else cables = stageUpdate(cables, c.id, c as Partial<Cable>);
          }

          return { overlays: { ...s.overlays, assets, cables } };
        }),

      // ── 랙모듈 stage 액션 (assets overlay 위임) ──
      stageRackModuleCreate: (m) =>
        set((s) => {
          if (!s.substationId) return s; // 미로드 — 무시(null substationId asset 방지)
          // floorId 는 부모 랙 Asset 의 floorId 를 상속(effective 에서 조회, 없으면 null).
          const parent = mergeEffective(s.saved.assets, s.overlays.assets, assetDescriptor)
            .find((a) => a.id === m.rackEquipmentId);
          const asset = rackModuleToAssetCreate(m, {
            substationId: s.substationId,
            floorId: parent?.floorId ?? null,
            tempId: m.id,
          });
          return { overlays: { ...s.overlays, assets: stageCreate(s.overlays.assets, asset.id, asset) } };
        }),

      stageRackModuleUpdate: (id, patch) =>
        set((s) => ({
          overlays: { ...s.overlays, assets: stageUpdate(s.overlays.assets, id, rackModuleToAssetPatch(patch)) },
        })),

      stageRackModuleDelete: (id) =>
        set((s) => ({ overlays: { ...s.overlays, assets: stageDelete(s.overlays.assets, id, isTempId(id)) } })),

      effectiveAssets: () => {
        const s = get();
        return mergeEffective(s.saved.assets, s.overlays.assets, assetDescriptor);
      },
      effectiveTopAssets: () => get().effectiveAssets().filter((a) => !isRackModuleChild(a)),
      effectiveAssetsByFloor: (floorId) => get().effectiveTopAssets().filter((a) => a.floorId === floorId),
      effectiveEquipment: (floorId) => get().effectiveAssetsByFloor(floorId).map(assetToEquipment),
      effectiveRackModules: (rackId) =>
        get().effectiveAssets().filter((a) => a.parentAssetId === rackId && a.slotIndex != null),
      effectiveCables: () => {
        const s = get();
        return mergeEffective(s.saved.cables, s.overlays.cables, cableDescriptor);
      },
      effectiveFiberPaths: () => {
        const s = get();
        return mergeEffective(s.saved.fiberPaths, s.overlays.fiberPaths, fiberPathDescriptor);
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
