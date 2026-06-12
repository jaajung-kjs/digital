import { create } from 'zustand';

interface SelectionState {
  selectedAssetId: string | null;
  setSelectedAssetId: (id: string | null) => void;
}

/** 워크스페이스 단일 선택 소스(SSOT). React·캔버스 핸들러 양쪽에서 접근. */
export const useSelectionStore = create<SelectionState>((set) => ({
  selectedAssetId: null,
  setSelectedAssetId: (id) => set({ selectedAssetId: id }),
}));
