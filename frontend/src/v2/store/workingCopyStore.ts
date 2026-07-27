import { temporal } from 'zundo';
import { createStore, useStore } from 'zustand';
import { shallow } from 'zustand/shallow';
import { fetchWorkingcopy } from '../api';
import type { V2Asset, V2InspectionLog, V2MaintenanceLog, V2Workingcopy } from '../types';
import { emptyOverlay, mergeEffective, overlayDirtyCount, stageCreate, stageDelete, stageUpdate, type Overlay } from './overlay';

interface Overlays {
  assets: Overlay<V2Asset>;
  maintenance: Overlay<V2MaintenanceLog>;
  inspections: Overlay<V2InspectionLog>;
}

const EMPTY_SAVED = { substation: null as V2Workingcopy['substation'] | null, floors: [] as V2Workingcopy['floors'], assets: [] as V2Asset[], maintenanceLogs: [] as V2MaintenanceLog[], inspectionLogs: [] as V2InspectionLog[] };

function emptyOverlays(): Overlays {
  return { assets: emptyOverlay(), maintenance: emptyOverlay(), inspections: emptyOverlay() };
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
  effectiveAssets: () => V2Asset[];
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
        const wc = await fetchWorkingcopy(substationId);
        set({
          substationId,
          saved: { substation: wc.substation, floors: wc.floors, assets: wc.assets, maintenanceLogs: wc.maintenanceLogs, inspectionLogs: wc.inspectionLogs },
          overlays: emptyOverlays(),
          baseVersions: Object.fromEntries(wc.assets.map((a) => [a.id, a.updatedAt])),
        });
        t.clear();
        t.resume();
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
        const s = get();
        const all = s.effectiveAssets();
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
        set((st) => {
          let assets = st.overlays.assets;
          let maintenance = st.overlays.maintenance;
          let inspections = st.overlays.inspections;
          for (const tid of targets) {
            assets = stageDelete(assets, tid);
            for (const m of mergeEffective(st.saved.maintenanceLogs, maintenance).filter((r) => r.assetId === tid)) maintenance = stageDelete(maintenance, m.id);
            for (const i of mergeEffective(st.saved.inspectionLogs, inspections).filter((r) => r.assetId === tid)) inspections = stageDelete(inspections, i.id);
          }
          return { overlays: { assets, maintenance, inspections } };
        });
      },

      stageMaintenanceCreate: (log) => set((s) => ({ overlays: { ...s.overlays, maintenance: stageCreate(s.overlays.maintenance, log.id, log) } })),
      stageMaintenanceUpdate: (id, patch) => set((s) => ({ overlays: { ...s.overlays, maintenance: stageUpdate(s.overlays.maintenance, id, patch) } })),
      stageMaintenanceDelete: (id) => set((s) => ({ overlays: { ...s.overlays, maintenance: stageDelete(s.overlays.maintenance, id) } })),
      stageInspectionCreate: (log) => set((s) => ({ overlays: { ...s.overlays, inspections: stageCreate(s.overlays.inspections, log.id, log) } })),
      stageInspectionUpdate: (id, patch) => set((s) => ({ overlays: { ...s.overlays, inspections: stageUpdate(s.overlays.inspections, id, patch) } })),
      stageInspectionDelete: (id) => set((s) => ({ overlays: { ...s.overlays, inspections: stageDelete(s.overlays.inspections, id) } })),

      effectiveAssets: () => mergeEffective(get().saved.assets, get().overlays.assets),
      effectiveMaintenanceFor: (assetId) => mergeEffective(get().saved.maintenanceLogs, get().overlays.maintenance).filter((r) => r.assetId === assetId),
      effectiveInspectionsFor: (assetId) => mergeEffective(get().saved.inspectionLogs, get().overlays.inspections).filter((r) => r.assetId === assetId),
      dirtyCount: () => {
        const o = get().overlays;
        return overlayDirtyCount(o.assets) + overlayDirtyCount(o.maintenance) + overlayDirtyCount(o.inspections);
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
