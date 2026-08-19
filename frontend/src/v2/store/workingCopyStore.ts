import { temporal } from 'zundo';
import { createStore, useStore } from 'zustand';
import { shallow } from 'zustand/shallow';
import { fetchWorkingcopy } from '../api';
import { apiErrorMessage } from '../apiError';
import { useV2Notice } from './noticeStore';
import type { V2Asset, V2AssetPhoto, V2Cable, V2Floor, V2InspectionLog, V2MaintenanceLog, V2Workingcopy } from '../types';
import { emptyOverlay, mergeEffective, overlayDirtyCount, stageCreate, stageDelete, stageUpdate, type Overlay } from './overlay';

interface Overlays {
  assets: Overlay<V2Asset>;
  maintenance: Overlay<V2MaintenanceLog>;
  inspections: Overlay<V2InspectionLog>;
  cables: Overlay<V2Cable>;
  photos: Overlay<V2AssetPhoto>;
}

const EMPTY_SAVED = { substation: null as V2Workingcopy['substation'] | null, floors: [] as V2Workingcopy['floors'], assets: [] as V2Asset[], maintenanceLogs: [] as V2MaintenanceLog[], inspectionLogs: [] as V2InspectionLog[], cables: [] as V2Cable[], photos: [] as V2AssetPhoto[] };

function emptyOverlays(): Overlays {
  return { assets: emptyOverlay(), maintenance: emptyOverlay(), inspections: emptyOverlay(), cables: emptyOverlay(), photos: emptyOverlay() };
}

export interface V2WorkingCopyState {
  substationId: string | null;
  saved: typeof EMPTY_SAVED;
  overlays: Overlays;
  baseVersions: Record<string, string>;
  /** 워킹카피 조회 진행 중 — 이 앱에서 가장 무거운 조회다(배경도면 포함 시 수백 KB). */
  loading: boolean;
  load: (substationId: string) => Promise<void>;
  applyFloor: (floor: V2Floor) => void;
  revert: () => void;
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
      saved: EMPTY_SAVED,
      overlays: emptyOverlays(),
      baseVersions: {},

      load: async (substationId) => {
        const t = v2WorkingCopyStore.temporal.getState();
        t.pause();
        // 대상을 먼저 바꾸고 이전 변전소 데이터를 비운다 — 그러지 않으면 조회가
        // 끝날 때까지 **A 의 자산이 B 의 이름 아래** 그대로 보인다(피드백 부재가
        // 아니라 틀린 데이터를 보여주는 것이다).
        set({ substationId, loading: true, saved: EMPTY_SAVED, overlays: emptyOverlays() });
        try {
          const wc = await fetchWorkingcopy(substationId);
          set({
            saved: { substation: wc.substation, floors: wc.floors, assets: wc.assets, maintenanceLogs: wc.maintenanceLogs, inspectionLogs: wc.inspectionLogs, cables: wc.cables, photos: wc.photos },
            overlays: emptyOverlays(),
            baseVersions: {
              ...Object.fromEntries(wc.assets.map((a) => [a.id, a.updatedAt])),
              ...Object.fromEntries(wc.cables.map((c) => [c.id, c.updatedAt])),
            },
          });
          t.clear();
        } catch (e) {
          // 조회 실패를 삼키면 화면은 빈 채로 남고 사용자는 이유를 알 수 없다.
          // 문구 번역은 apiErrorMessage(단일 지점)가 한다.
          useV2Notice.getState().showError(apiErrorMessage(e, '변전소 데이터를 불러오지 못했습니다'));
        } finally {
          set({ loading: false });
          t.resume();
        }
      },

      /**
       * 서버가 **즉시 확정한** 층 하나를 saved.floors 에 반영한다 — 새 층이면 더하고, 이미
       * 있으면 그 행만 갈아 끼운다(배경 도면 임포트/제거, 층 추가).
       *
       * 층은 오버레이 스테이징 대상이 아니라 커밋 경로를 타지 않는다. 그렇다고 전체 재로드
       * (`load`)를 부를 수는 없다 — **그것은 스테이징한 변경과 undo 히스토리를 버린다**.
       * 그래서 그 행만 반영한다. 더하는 쪽이 빠져 있어서, 층을 만들어도 평면도는 「층이
       * 없습니다」인 채였고 변전소를 다시 고르기 전까지 나타나지 않았다.
       */
      applyFloor: (floor) =>
        set((s) => ({
          saved: {
            ...s.saved,
            floors: s.saved.floors.some((f) => f.id === floor.id)
              ? s.saved.floors.map((f) => (f.id === floor.id ? floor : f))
              : [...s.saved.floors, floor],
          },
        })),

      revert: () => {
        const t = v2WorkingCopyStore.temporal.getState();
        t.pause();
        set({ overlays: emptyOverlays() });
        t.clear();
        t.resume();
      },

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
          return { overlays: { assets, maintenance, inspections, cables, photos } };
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

      effectiveAssets: () => mergeEffective(get().saved.assets, get().overlays.assets),
      effectiveCables: () => mergeEffective(get().saved.cables, get().overlays.cables),
      effectiveMaintenanceFor: (assetId) => mergeEffective(get().saved.maintenanceLogs, get().overlays.maintenance).filter((r) => r.assetId === assetId),
      effectiveInspectionsFor: (assetId) => mergeEffective(get().saved.inspectionLogs, get().overlays.inspections).filter((r) => r.assetId === assetId),
      dirtyCount: () => {
        const o = get().overlays;
        return overlayDirtyCount(o.assets) + overlayDirtyCount(o.maintenance) + overlayDirtyCount(o.inspections) + overlayDirtyCount(o.cables) + overlayDirtyCount(o.photos);
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
