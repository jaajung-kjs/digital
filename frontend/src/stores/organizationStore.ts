import { create } from 'zustand';
import type { NodeType } from '../types/organization';
import { useSubstationWorkingCopy } from '../features/workingCopy/substationStore';

// ──────────────────────────────────────────────────────────────────────────
// organizationStore — UI 상태 전용.
//
// 데이터(roots/findNode/setChildren/...) 는 substationStore 의 effective 4컬렉션
// (saved∪overlay)에서 buildOrgTree 로 파생한다(features/workingCopy/hooks 의
// useEffectiveOrgTree / useFindOrgNode / getOrgNode).
// 이 스토어는 선택·펼침·viewingNode 등 순수 UI 상태만 소유한다.
// ──────────────────────────────────────────────────────────────────────────

interface OrganizationUIState {
  selectedNodeId: string | null;
  selectedNodeType: NodeType | null;
  selectNode: (id: string, type: NodeType) => void;

  viewingNodeId: string | null;
  setViewingNodeId: (id: string | null) => void;

  /** 펼침 집합(Set<id>). expandNode / expandAncestors 가 관리한다. */
  expandedIds: Set<string>;
  expandNode: (id: string) => void;
  /**
   * 주어진 id 의 조상을 펼침 집합에 추가한다.
   * 부모 포인터는 substationStore saved 평면 컬렉션을 직접 도보(트리 빌드 없음).
   */
  expandAncestors: (id: string) => void;

  reset: () => void;
}

/** substationStore saved 평면 컬렉션에서 nodeId 의 부모 id 를 반환(없으면 null). */
function getParentId(nodeId: string): string | null {
  const s = useSubstationWorkingCopy.getState();
  const floor = s.saved.floors.find((f) => f.id === nodeId);
  if (floor) return floor.substationId;
  const sub = s.saved.substations.find((sub) => sub.id === nodeId);
  if (sub) return sub.branchId;
  const branch = s.saved.branches.find((b) => b.id === nodeId);
  if (branch) return branch.headquartersId;
  return null; // headquarters: no parent
}

export const useOrganizationStore = create<OrganizationUIState>((set) => ({
  selectedNodeId: null,
  selectedNodeType: null,
  viewingNodeId: null,
  expandedIds: new Set<string>(),

  selectNode: (id, type) => set({ selectedNodeId: id, selectedNodeType: type }),

  setViewingNodeId: (id) => set({ viewingNodeId: id }),

  expandNode: (id) =>
    set((state) => {
      if (state.expandedIds.has(id)) return state;
      const next = new Set(state.expandedIds);
      next.add(id);
      return { expandedIds: next };
    }),

  expandAncestors: (id) => {
    const ancestorIds: string[] = [];
    let cur = getParentId(id);
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      ancestorIds.push(cur);
      cur = getParentId(cur);
    }
    if (ancestorIds.length === 0) return;

    set((state) => {
      if (ancestorIds.every((a) => state.expandedIds.has(a))) return state;
      const next = new Set(state.expandedIds);
      for (const a of ancestorIds) next.add(a);
      return { expandedIds: next };
    });
  },

  reset: () =>
    set({ selectedNodeId: null, selectedNodeType: null, viewingNodeId: null, expandedIds: new Set() }),
}));
