import { create } from 'zustand';
import type { Asset, UpdateAssetInput } from '../../types/asset';
import { emptyOverlay, stageCreate, stageUpdate, stageDelete, overlayDirtyCount, snapshotBaseVersions, type Overlay } from '../workingCopy/overlay';

export interface PhotoQueueItem { tempPhotoId: string; assetId: string; side: 'front' | 'rear'; file: File; objectUrl: string }
export interface LogQueueItem { tempLogId: string; assetId: string; logType: string; title: string }

interface RegisterState {
  substationId: string | null;
  overlay: Overlay<Asset, Partial<UpdateAssetInput>>;
  photoQueue: PhotoQueueItem[];
  logQueue: LogQueueItem[];
  load: (substationId: string, saved: Asset[]) => void;
  stageCreate: (tempId: string, item: Asset) => void;
  stageUpdate: (id: string, patch: Partial<UpdateAssetInput>) => void;
  stageDelete: (id: string, isTemp: boolean) => void;
  enqueuePhoto: (item: PhotoQueueItem) => void;
  enqueueLog: (item: LogQueueItem) => void;
  revert: () => void;
  clear: () => void;
  dirtyCount: () => number;
}

export const useRegisterStore = create<RegisterState>((set, get) => ({
  substationId: null,
  overlay: emptyOverlay<Asset, Partial<UpdateAssetInput>>(),
  photoQueue: [],
  logQueue: [],
  load: (substationId, saved) => set({
    substationId,
    overlay: { ...emptyOverlay<Asset, Partial<UpdateAssetInput>>(), baseVersions: snapshotBaseVersions(saved, (a) => a.id, (a) => a.updatedAt ?? null) },
    photoQueue: [], logQueue: [],
  }),
  stageCreate: (tempId, item) => set((s) => ({ overlay: stageCreate(s.overlay, tempId, item) })),
  stageUpdate: (id, patch) => set((s) => ({ overlay: stageUpdate(s.overlay, id, patch) })),
  stageDelete: (id, isTemp) => set((s) => ({
    overlay: stageDelete(s.overlay, id, isTemp),
    photoQueue: s.photoQueue.filter((p) => p.assetId !== id),
    logQueue: s.logQueue.filter((l) => l.assetId !== id),
  })),
  enqueuePhoto: (item) => set((s) => ({ photoQueue: [...s.photoQueue, item] })),
  enqueueLog: (item) => set((s) => ({ logQueue: [...s.logQueue, item] })),
  revert: () => set((s) => ({ overlay: { ...emptyOverlay<Asset, Partial<UpdateAssetInput>>(), baseVersions: s.overlay.baseVersions }, photoQueue: [], logQueue: [] })),
  clear: () => set({ overlay: emptyOverlay<Asset, Partial<UpdateAssetInput>>(), photoQueue: [], logQueue: [] }),
  dirtyCount: () => { const s = get(); return overlayDirtyCount(s.overlay) + s.photoQueue.length + s.logQueue.length; },
}));
