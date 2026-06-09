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

// ──────────────────────────────────────────────────────────────────────────
// SSOT-2b Task 3 — substation-scoped Unit-of-Work.
//
// 한 변전소의 working copy 전체(assets / cables / distributionCircuits /
// fiberPaths)를 단일 store 에 담는다. 각 컬렉션은 Lv1 엔진(overlay/effective/
// descriptor)을 그대로 재사용하고, undo/redo 는 zundo `temporal` 로 overlays
// 슬라이스만 history 에 담아 제공한다. 효과(effective) 셀렉터는 getState()로
// 호출 가능한 plain method 로 둔다 — React 메모이즈 hook 은 2c/2d 의 몫.
// ──────────────────────────────────────────────────────────────────────────

/**
 * cables / distributionCircuits / fiberPaths row 의 최소 계약.
 * 배치 Asset 외 컬렉션은 store 내부에서 id/updatedAt 만 알면 충분하다
 * (엔진이 idOf/versionOf 만 요구). 구체 타입은 commit 빌더(2b-T4)의 몫.
 */
export interface WorkingCopyRow {
  id: string;
  updatedAt?: string | null;
  [key: string]: unknown;
}

type Cable = WorkingCopyRow;
type DistributionCircuit = WorkingCopyRow;
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
export const distCircuitDescriptor = makeDescriptor<DistributionCircuit>('distributionCircuits');
export const fiberPathDescriptor = makeDescriptor<FiberPath>('fiberPaths');

interface SavedCollections {
  assets: Asset[];
  cables: Cable[];
  distributionCircuits: DistributionCircuit[];
  fiberPaths: FiberPath[];
}

interface Overlays {
  assets: Overlay<Asset, Partial<Asset>>;
  cables: Overlay<Cable, Partial<Cable>>;
  distributionCircuits: Overlay<DistributionCircuit, Partial<DistributionCircuit>>;
  fiberPaths: Overlay<FiberPath, Partial<FiberPath>>;
}

const emptySaved = (): SavedCollections => ({
  assets: [],
  cables: [],
  distributionCircuits: [],
  fiberPaths: [],
});

/** saved 컬렉션에서 baseVersions 까지 채운 빈 overlay 세트를 만든다. */
function freshOverlays(saved: SavedCollections): Overlays {
  return {
    assets: {
      ...emptyOverlay<Asset, Partial<Asset>>(),
      baseVersions: snapshotBaseVersions(saved.assets, assetDescriptor.idOf, assetDescriptor.versionOf!),
    },
    cables: {
      ...emptyOverlay<Cable, Partial<Cable>>(),
      baseVersions: snapshotBaseVersions(saved.cables, cableDescriptor.idOf, cableDescriptor.versionOf!),
    },
    distributionCircuits: {
      ...emptyOverlay<DistributionCircuit, Partial<DistributionCircuit>>(),
      baseVersions: snapshotBaseVersions(saved.distributionCircuits, distCircuitDescriptor.idOf, distCircuitDescriptor.versionOf!),
    },
    fiberPaths: {
      ...emptyOverlay<FiberPath, Partial<FiberPath>>(),
      baseVersions: snapshotBaseVersions(saved.fiberPaths, fiberPathDescriptor.idOf, fiberPathDescriptor.versionOf!),
    },
  };
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
  stageDistCircuitCreate: (item: DistributionCircuit) => void;
  stageDistCircuitUpdate: (id: string, patch: Partial<DistributionCircuit>) => void;
  stageDistCircuitDelete: (id: string) => void;
  stageFiberPathCreate: (item: FiberPath) => void;
  stageFiberPathUpdate: (id: string, patch: Partial<FiberPath>) => void;
  stageFiberPathDelete: (id: string) => void;

  // ── effective selectors (getState() 로 호출 가능한 plain method) ──
  effectiveAssets: () => Asset[];
  effectiveTopAssets: () => Asset[];
  effectiveAssetsByFloor: (floorId: string) => Asset[];
  effectiveEquipment: (floorId: string) => FloorPlanEquipment[];
  effectiveRackModules: (rackId: string) => Asset[];
  effectiveCables: () => Cable[];
  effectiveDistCircuits: () => DistributionCircuit[];
  effectiveFiberPaths: () => FiberPath[];

  dirtyCount: () => number;
}

/** undo/redo history 에 담는 슬라이스 — overlays 만(saved/substationId 제외). */
type HistorySlice = Pick<SubstationWorkingCopyState, 'overlays'>;

// 빠른 변전소 전환(S1→S2) 시 늦게 도착한 S1 응답이 S2 데이터를 덮어쓰지
// 않도록 하는 monotonic 가드. load 마다 ++loadSeq 후, 응답 처리 직전에
// 자신의 seq 가 최신인지 확인한다(아니면 폐기).
let loadSeq = 0;

/** 어떤 asset 이 랙 모듈 자식인지: parentAssetId 가 있고 slotIndex 가 null 이 아님. */
function isRackModuleChild(a: Asset): boolean {
  return a.parentAssetId != null && a.slotIndex != null;
}

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
          distributionCircuits: data.data.distributionCircuits ?? [],
          fiberPaths: data.data.fiberPaths ?? [],
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
          distributionCircuits: data.data.distributionCircuits ?? [],
          fiberPaths: data.data.fiberPaths ?? [],
        };
        // staged overlay(creates/updates/deletes)는 보존하고 baseVersions 만 최신 saved 기준으로 재스냅샷.
        set((s) => ({
          substationId,
          saved: newSaved,
          overlays: {
            assets: { ...s.overlays.assets, baseVersions: snapshotBaseVersions(newSaved.assets, assetDescriptor.idOf, assetDescriptor.versionOf!) },
            cables: { ...s.overlays.cables, baseVersions: snapshotBaseVersions(newSaved.cables, cableDescriptor.idOf, cableDescriptor.versionOf!) },
            distributionCircuits: { ...s.overlays.distributionCircuits, baseVersions: snapshotBaseVersions(newSaved.distributionCircuits, distCircuitDescriptor.idOf, distCircuitDescriptor.versionOf!) },
            fiberPaths: { ...s.overlays.fiberPaths, baseVersions: snapshotBaseVersions(newSaved.fiberPaths, fiberPathDescriptor.idOf, fiberPathDescriptor.versionOf!) },
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

      stageDistCircuitCreate: (item) =>
        set((s) => ({ overlays: { ...s.overlays, distributionCircuits: stageCreate(s.overlays.distributionCircuits, item.id, item) } })),
      stageDistCircuitUpdate: (id, patch) =>
        set((s) => ({ overlays: { ...s.overlays, distributionCircuits: stageUpdate(s.overlays.distributionCircuits, id, patch) } })),
      stageDistCircuitDelete: (id) =>
        set((s) => ({ overlays: { ...s.overlays, distributionCircuits: stageDelete(s.overlays.distributionCircuits, id, isTempId(id)) } })),

      stageFiberPathCreate: (item) =>
        set((s) => ({ overlays: { ...s.overlays, fiberPaths: stageCreate(s.overlays.fiberPaths, item.id, item) } })),
      stageFiberPathUpdate: (id, patch) =>
        set((s) => ({ overlays: { ...s.overlays, fiberPaths: stageUpdate(s.overlays.fiberPaths, id, patch) } })),
      stageFiberPathDelete: (id) =>
        set((s) => ({ overlays: { ...s.overlays, fiberPaths: stageDelete(s.overlays.fiberPaths, id, isTempId(id)) } })),

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
      effectiveDistCircuits: () => {
        const s = get();
        return mergeEffective(s.saved.distributionCircuits, s.overlays.distributionCircuits, distCircuitDescriptor);
      },
      effectiveFiberPaths: () => {
        const s = get();
        return mergeEffective(s.saved.fiberPaths, s.overlays.fiberPaths, fiberPathDescriptor);
      },

      dirtyCount: () => {
        const o = get().overlays;
        return (
          overlayDirtyCount(o.assets) +
          overlayDirtyCount(o.cables) +
          overlayDirtyCount(o.distributionCircuits) +
          overlayDirtyCount(o.fiberPaths)
        );
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
