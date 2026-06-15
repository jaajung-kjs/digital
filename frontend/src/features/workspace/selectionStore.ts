import { create } from 'zustand';

interface SelectionState {
  selectedAssetId: string | null;
  selectedCore: number | null;
  setSelectedAssetId: (id: string | null) => void;
  setSelectedCore: (core: number | null) => void;
  setSelected: (id: string | null, core: number | null) => void;
}

/** 워크스페이스 단일 선택 소스(SSOT). React·캔버스 핸들러 양쪽에서 접근. */
export const useSelectionStore = create<SelectionState>((set) => ({
  selectedAssetId: null,
  selectedCore: null,
  setSelectedAssetId: (id) => set({ selectedAssetId: id, selectedCore: null }), // 다른 자산 선택 시 코어 리셋
  setSelectedCore: (core) => set({ selectedCore: core }),
  setSelected: (id, core) => set({ selectedAssetId: id, selectedCore: core }),
}));
