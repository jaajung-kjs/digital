import { temporal } from 'zundo';
import { createStore, useStore } from 'zustand';
import { shallow } from 'zustand/shallow';
import { fetchWorkingcopy } from '../api';
import { apiErrorMessage } from '../apiError';
import { useV2Notice } from './noticeStore';
import type { V2Asset, V2AssetPhoto, V2Cable, V2Floor, V2InspectionLog, V2MaintenanceLog, V2Workingcopy } from '../types';
import { emptyOverlay, mergeEffective, overlayDirtyCount, stageCreate, stageDelete, stageUpdate, type Overlay } from './overlay';

interface Overlays {
  /** 층도 워킹카피의 것이다 — 저장해야 서버로 간다(자산·케이블과 같은 규칙 하나). */
  floors: Overlay<V2Floor>;
  assets: Overlay<V2Asset>;
  maintenance: Overlay<V2MaintenanceLog>;
  inspections: Overlay<V2InspectionLog>;
  cables: Overlay<V2Cable>;
  photos: Overlay<V2AssetPhoto>;
}

const EMPTY_SAVED = { substation: null as V2Workingcopy['substation'] | null, floors: [] as V2Workingcopy['floors'], assets: [] as V2Asset[], maintenanceLogs: [] as V2MaintenanceLog[], inspectionLogs: [] as V2InspectionLog[], cables: [] as V2Cable[], photos: [] as V2AssetPhoto[] };

/** 빈 오버레이 한 벌 — **한 곳에서만 만든다**(종류가 하나 늘 때 빠뜨릴 자리를 없앤다). */
export function emptyOverlays(): Overlays {
  return { floors: emptyOverlay(), assets: emptyOverlay(), maintenance: emptyOverlay(), inspections: emptyOverlay(), cables: emptyOverlay(), photos: emptyOverlay() };
}

export interface V2WorkingCopyState {
  substationId: string | null;
  saved: typeof EMPTY_SAVED;
  overlays: Overlays;
  baseVersions: Record<string, string>;
  /** 워킹카피 조회 진행 중 — 이 앱에서 가장 무거운 조회다(배경도면 포함 시 수백 KB). */
  loading: boolean;
  /** 읽는 중인 변전소 — 화면이 아직 갈아 끼우지 않은 것. 없으면 `null`. */
  pendingSubstationId: string | null;
  load: (substationId: string) => Promise<void>;
  revert: () => void;
  stageFloorCreate: (floor: V2Floor) => void;
  stageFloorUpdate: (id: string, patch: Partial<V2Floor>) => void;
  stageFloorDelete: (id: string) => void;
  stageAssetCreate: (asset: V2Asset) => void;
  stageAssetUpdate: (id: string, patch: Partial<V2Asset>) => void;
  stageAssetDeleteCascade: (id: string) => void;
  stageMaintenanceCreate: (log: V2MaintenanceLog) => void;
  stageMaintenanceUpdate: (id: string, patch: Partial<V2MaintenanceLog>) => void;
  stageMaintenanceDelete: (id: string) => void;
  stageInspectionCreate: (log: V2InspectionLog) => void;
  stageInspectionUpdate: (id: string, patch: Partial<V2InspectionLog>) => void;
  stageInspectionDelete: (id: string) => void;
  stagePhotoCreate: (photo: V2AssetPhoto) => void;
  stagePhotoUpdate: (id: string, patch: Partial<V2AssetPhoto>) => void;
  stagePhotoDelete: (id: string) => void;
  stageCableCreate: (cable: V2Cable) => void;
  stageCableUpdate: (id: string, patch: Partial<V2Cable>) => void;
  stageCableDelete: (id: string) => void;
  effectiveFloors: () => V2Floor[];
  effectiveAssets: () => V2Asset[];
  effectiveCables: () => V2Cable[];
  effectiveMaintenanceFor: (assetId: string) => V2MaintenanceLog[];
  effectiveInspectionsFor: (assetId: string) => V2InspectionLog[];
  dirtyCount: () => number;
  isTempId: (id: string) => boolean;
}

export const v2WorkingCopyStore = createStore<V2WorkingCopyState>()(
  temporal(
    (set, get) => ({
      substationId: null,
      loading: false,
      pendingSubstationId: null,
      saved: EMPTY_SAVED,
      overlays: emptyOverlays(),
      baseVersions: {},

      /**
       * 변전소 하나를 읽어 온다 — **다 읽은 뒤에 한 번에** 갈아 끼운다.
       *
       * 예전에는 부르는 즉시 비웠다(대상을 바꾸고 `saved` 를 EMPTY 로). 「A 의 자산이 B 의
       * 이름 아래」 보이는 것을 막으려던 것인데, 그 바람에 변전소를 옮길 때마다 화면이
       * **지워졌다 다시 그려졌다** — 재어 보니 45ms 동안 빈 화면이라, 눈에는 깜빡임으로 남았다.
       *
       * 이제 읽는 동안 **이전 변전소가 그대로 서 있는다**(`substationId` 도 그대로다). 화면은
       * 「지금 들고 있는 변전소」를 그리므로 이름과 자산이 어긋날 수가 없고, 다 읽으면 이름과
       * 내용이 같은 순간에 바뀐다.
       *
       * 읽는 중인 대상은 `pendingSubstationId` 가 안다 — 빨리 두 번 누르면 **마지막 것만**
       * 실린다(먼저 떠난 조회가 늦게 도착해 뒤엎지 않게).
       */
      load: async (substationId) => {
        const t = v2WorkingCopyStore.temporal.getState();
        t.pause();
        set({ loading: true, pendingSubstationId: substationId });
        try {
          const wc = await fetchWorkingcopy(substationId);
          if (get().pendingSubstationId !== substationId) return; // 더 나중 것이 떠났다
          set({
            substationId,
            saved: { substation: wc.substation, floors: wc.floors, assets: wc.assets, maintenanceLogs: wc.maintenanceLogs, inspectionLogs: wc.inspectionLogs, cables: wc.cables, photos: wc.photos },
            overlays: emptyOverlays(),
            baseVersions: {
              ...Object.fromEntries(wc.assets.map((a) => [a.id, a.updatedAt])),
              ...Object.fromEntries(wc.cables.map((c) => [c.id, c.updatedAt])),
              ...Object.fromEntries(wc.floors.map((f) => [f.id, f.updatedAt])),
            },
          });
          t.clear();
        } catch (e) {
          /* 못 읽었으면 **그 변전소로 옮기되 비운다** — 이전 변전소를 그대로 두면 트리는 B 를
             가리키는데 화면은 A 를 보여 주는, 서로 다른 것을 말하는 화면이 된다. 왜 비었는지는
             알림이 말한다(문구 번역은 `apiErrorMessage` 한 곳). */
          if (get().pendingSubstationId === substationId) {
            set({ substationId, saved: EMPTY_SAVED, overlays: emptyOverlays(), baseVersions: {} });
          }
          useV2Notice.getState().showError(apiErrorMessage(e, '변전소 데이터를 불러오지 못했습니다'));
        } finally {
          if (get().pendingSubstationId === substationId) set({ loading: false, pendingSubstationId: null });
          t.resume();
        }
      },

      revert: () => {
        const t = v2WorkingCopyStore.temporal.getState();
        t.pause();
        set({ overlays: emptyOverlays() });
        t.clear();
        t.resume();
      },

      /**
       * 층 — **다른 것과 똑같이** 쌓았다가 저장할 때 나간다.
       *
       * 예전에는 층만 즉시 쓰기였다(조직 CRUD 를 같이 썼다). 한 화면에서 규칙이 둘 돌면 그
       * 경계마다 예외가 생긴다: 그 층의 설비를 지워도 저장 전에는 층을 못 지웠고(서버는 아직
       * 설비가 있다고 본다), 되돌리기는 층에 듣지 않았으며, 배경 도면은 물린 즉시 확정됐다.
       */
      stageFloorCreate: (floor) => set((s) => ({ overlays: { ...s.overlays, floors: stageCreate(s.overlays.floors, floor.id, floor) } })),
      stageFloorUpdate: (id, patch) => set((s) => ({ overlays: { ...s.overlays, floors: stageUpdate(s.overlays.floors, id, patch) } })),
      /* 층에 딸린 자산까지 걷어내지는 않는다 — 비어 있을 때만 지울 수 있다는 것을 화면이 먼저
         말하고(`floorBlockedReason`), 서버도 같은 규칙으로 막는다. */
      stageFloorDelete: (id) => set((s) => ({ overlays: { ...s.overlays, floors: stageDelete(s.overlays.floors, id) } })),

      stageAssetCreate: (asset) => set((s) => ({ overlays: { ...s.overlays, assets: stageCreate(s.overlays.assets, asset.id, asset) } })),
      stageAssetUpdate: (id, patch) => set((s) => ({ overlays: { ...s.overlays, assets: stageUpdate(s.overlays.assets, id, patch) } })),

      stageAssetDeleteCascade: (id) => {
        set((st) => {
          const all = mergeEffective(st.saved.assets, st.overlays.assets);
          const targets = new Set<string>([id]);
          let grew = true;
          while (grew) {
            grew = false;
            for (const a of all) {
              if (a.parentAssetId && targets.has(a.parentAssetId) && !targets.has(a.id)) {
                targets.add(a.id);
                grew = true;
              }
            }
          }
          let assets = st.overlays.assets;
          let maintenance = st.overlays.maintenance;
          let inspections = st.overlays.inspections;
          let photos = st.overlays.photos;
          for (const tid of targets) {
            assets = stageDelete(assets, tid);
            for (const m of mergeEffective(st.saved.maintenanceLogs, maintenance).filter((r) => r.assetId === tid)) maintenance = stageDelete(maintenance, m.id);
            for (const i of mergeEffective(st.saved.inspectionLogs, inspections).filter((r) => r.assetId === tid)) inspections = stageDelete(inspections, i.id);
            for (const p of mergeEffective(st.saved.photos, photos).filter((r) => r.assetId === tid)) photos = stageDelete(photos, p.id);
          }
          // cascade cable deletes — compute portIds from pre-delete effective assets
          const effCables = mergeEffective(st.saved.cables, st.overlays.cables);
          const preDel = mergeEffective(st.saved.assets, st.overlays.assets);
          const portIds = new Set(preDel.filter((a) => targets.has(a.id)).flatMap((a) => a.ports.map((p) => p.id)));
          let cables = st.overlays.cables;
          for (const cable of effCables) {
            if (portIds.has(cable.aPortId) || portIds.has(cable.bPortId)) {
              cables = stageDelete(cables, cable.id);
            }
          }
          return { overlays: { ...st.overlays, assets, maintenance, inspections, cables, photos } };
        });
      },

      stageMaintenanceCreate: (log) => set((s) => ({ overlays: { ...s.overlays, maintenance: stageCreate(s.overlays.maintenance, log.id, log) } })),
      stageMaintenanceUpdate: (id, patch) => set((s) => ({ overlays: { ...s.overlays, maintenance: stageUpdate(s.overlays.maintenance, id, patch) } })),
      stageMaintenanceDelete: (id) => set((s) => ({ overlays: { ...s.overlays, maintenance: stageDelete(s.overlays.maintenance, id) } })),
      stageInspectionCreate: (log) => set((s) => ({ overlays: { ...s.overlays, inspections: stageCreate(s.overlays.inspections, log.id, log) } })),
      stageInspectionUpdate: (id, patch) => set((s) => ({ overlays: { ...s.overlays, inspections: stageUpdate(s.overlays.inspections, id, patch) } })),
      stageInspectionDelete: (id) => set((s) => ({ overlays: { ...s.overlays, inspections: stageDelete(s.overlays.inspections, id) } })),
      stagePhotoCreate: (photo) => set((s) => ({ overlays: { ...s.overlays, photos: stageCreate(s.overlays.photos, photo.id, photo) } })),
      stagePhotoUpdate: (id, patch) => set((s) => ({ overlays: { ...s.overlays, photos: stageUpdate(s.overlays.photos, id, patch) } })),
      stagePhotoDelete: (id) => set((s) => ({ overlays: { ...s.overlays, photos: stageDelete(s.overlays.photos, id) } })),

      stageCableCreate: (cable) => set((s) => ({ overlays: { ...s.overlays, cables: stageCreate(s.overlays.cables, cable.id, cable) } })),
      stageCableUpdate: (id, patch) => set((s) => ({ overlays: { ...s.overlays, cables: stageUpdate(s.overlays.cables, id, patch) } })),
      stageCableDelete: (id) => set((s) => ({ overlays: { ...s.overlays, cables: stageDelete(s.overlays.cables, id) } })),

      effectiveFloors: () => mergeEffective(get().saved.floors, get().overlays.floors).sort((a, b) => a.sortOrder - b.sortOrder),
      effectiveAssets: () => mergeEffective(get().saved.assets, get().overlays.assets),
      effectiveCables: () => mergeEffective(get().saved.cables, get().overlays.cables),
      effectiveMaintenanceFor: (assetId) => mergeEffective(get().saved.maintenanceLogs, get().overlays.maintenance).filter((r) => r.assetId === assetId),
      effectiveInspectionsFor: (assetId) => mergeEffective(get().saved.inspectionLogs, get().overlays.inspections).filter((r) => r.assetId === assetId),
      dirtyCount: () => {
        const o = get().overlays;
        return overlayDirtyCount(o.floors) + overlayDirtyCount(o.assets) + overlayDirtyCount(o.maintenance) + overlayDirtyCount(o.inspections) + overlayDirtyCount(o.cables) + overlayDirtyCount(o.photos);
      },
      isTempId: (id) => id in get().overlays.assets.creates,
    }),
    {
      partialize: (state) => ({ overlays: state.overlays }),
      equality: shallow,
      limit: 50,
    },
  ),
);

export const useV2WorkingCopy = Object.assign(
  <T,>(selector: (s: V2WorkingCopyState) => T): T => useStore(v2WorkingCopyStore, selector),
  { getState: () => v2WorkingCopyStore.getState(), temporal: v2WorkingCopyStore.temporal },
);
