import { create } from 'zustand';

interface SelectionState {
  selectedAssetId: string | null;
  selectedCore: number | null;
  /**
   * 연결탭이 정확히 어떤 연결도 컴포넌트를 골랐는지(그 컴포넌트의 시드 케이블 id).
   * core 만으로는 구분 안 되는 core-null 컴포넌트(피더 분배·번호 없는 네트워크 등)를
   * 유일하게 지목한다. 그리드/포트에서의 코어 선택은 이 앵커를 null 로 비워(코어 기준 해소).
   */
  selectedCableId: string | null;
  setSelectedAssetId: (id: string | null) => void;
  setSelectedCore: (core: number | null) => void;
  setSelected: (id: string | null, core: number | null) => void;
  /** 연결탭 전용: 컴포넌트를 시드 케이블로 정확 지목(+코어는 그리드 동기화용). */
  setSelectedComponent: (id: string, core: number | null, cableId: string) => void;
}

/** 워크스페이스 단일 선택 소스(SSOT). React·캔버스 핸들러 양쪽에서 접근. */
export const useSelectionStore = create<SelectionState>((set) => ({
  selectedAssetId: null,
  selectedCore: null,
  selectedCableId: null,
  setSelectedAssetId: (id) => set({ selectedAssetId: id, selectedCore: null, selectedCableId: null }), // 다른 자산 선택 시 코어/앵커 리셋
  setSelectedCore: (core) => set({ selectedCore: core, selectedCableId: null }),
  setSelected: (id, core) => set({ selectedAssetId: id, selectedCore: core, selectedCableId: null }),
  setSelectedComponent: (id, core, cableId) => set({ selectedAssetId: id, selectedCore: core, selectedCableId: cableId }),
}));
