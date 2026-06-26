import { create } from 'zustand';
import type { NodeType } from '../types/organization';

// ──────────────────────────────────────────────────────────────────────────
// organizationStore — UI 상태 전용.
//
// 데이터(roots/findNode/setChildren/...) 는 substationStore 의 effective 4컬렉션
// (saved∪overlay)에서 buildOrgTree 로 파생한다(features/workingCopy/hooks 의
// useEffectiveOrgTree / useFindOrgNode / getOrgNode).
// 이 스토어는 선택·viewingNode 등 순수 UI 상태만 소유한다.
// 펼침(expand) 상태는 TreePanel 이 로컬 소유한다.
// ──────────────────────────────────────────────────────────────────────────

interface OrganizationUIState {
  selectedNodeId: string | null;
  selectedNodeType: NodeType | null;
  selectNode: (id: string, type: NodeType) => void;

  viewingNodeId: string | null;
  setViewingNodeId: (id: string | null) => void;

  reset: () => void;
}

export const useOrganizationStore = create<OrganizationUIState>((set) => ({
  selectedNodeId: null,
  selectedNodeType: null,
  viewingNodeId: null,

  selectNode: (id, type) => set({ selectedNodeId: id, selectedNodeType: type }),

  setViewingNodeId: (id) => set({ viewingNodeId: id }),

  reset: () =>
    set({ selectedNodeId: null, selectedNodeType: null, viewingNodeId: null }),
}));
