import { useSelectionStore } from './selectionStore';

export interface Selection {
  selectedAssetId: string | null;
  setSelectedAssetId: (id: string | null) => void;
}

/** 워크스페이스 단일 선택 소스(Zustand selectionStore) 백킹 — 항상 truthy. */
export const useSelection = (): Selection => ({
  selectedAssetId: useSelectionStore((s) => s.selectedAssetId),
  setSelectedAssetId: useSelectionStore((s) => s.setSelectedAssetId),
});
