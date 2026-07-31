import { temporal } from 'zundo';
import { createStore, useStore } from 'zustand';
import { shallow } from 'zustand/shallow';
import { fetchWorkingcopy } from '../api';
import type { V2Asset, V2AssetPhoto, V2Cable, V2InspectionLog, V2MaintenanceLog, V2Workingcopy } from '../types';
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
  load: (substationId: string) => Promise<void>;
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
      saved: EMPTY_SAVED,
      overlays: emptyOverlays(),
      baseVersions: {},

      load: async (substationId) => {
        const t = v2WorkingCopyStore.temporal.getState();
        t.pause();
        try {
          const wc = await fetchWorkingcopy(substationId);
          set({
            substationId,
            saved: { substation: wc.substation, floors: wc.floors, assets: wc.assets, maintenanceLogs: wc.maintenanceLogs, inspectionLogs: wc.inspectionLogs, cables: wc.cables, photos: wc.photos },
            overlays: emptyOverlays(),
            baseVersions: {
              ...Object.fromEntries(wc.assets.map((a) => [a.id, a.updatedAt])),
              ...Object.fromEntries(wc.cables.map((c) => [c.id, c.updatedAt])),
            },
          });
          t.clear();
        } finally {
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
