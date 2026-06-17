import { api } from '../utils/api';
import type { HeadquartersItem, BranchItem, BranchSubstationItem, FloorListItem } from '../types';
import type { TreeNodeData, NodeType, OrgTree } from '../types/organization';

export const organizationApi = {
  // ── 조직트리 전체(평면) — 워킹카피 eager-load 용 ──
  getTree: async (): Promise<OrgTree> => {
    const { data } = await api.get<{ data: OrgTree }>('/organizations/tree');
    return data.data;
  },

  // ── Headquarters ──
  listHeadquarters: async (): Promise<HeadquartersItem[]> => {
    const { data } = await api.get<{ data: HeadquartersItem[] }>('/organizations/headquarters');
    return data.data;
  },
  createHeadquarters: async (payload: { name: string }): Promise<HeadquartersItem> => {
    const { data } = await api.post<{ data: HeadquartersItem }>('/organizations/headquarters', payload);
    return data.data;
  },
  renameHeadquarters: async (id: string, payload: { name: string }): Promise<HeadquartersItem> => {
    const { data } = await api.patch<{ data: HeadquartersItem }>(`/organizations/headquarters/${id}`, payload);
    return data.data;
  },
  deleteHeadquarters: async (id: string): Promise<void> => {
    await api.delete(`/organizations/headquarters/${id}`);
  },

  // ── Branch ──
  listBranches: async (hqId: string): Promise<BranchItem[]> => {
    const { data } = await api.get<{ data: BranchItem[] }>(`/organizations/headquarters/${hqId}/branches`);
    return data.data;
  },
  createBranch: async (hqId: string, payload: { name: string }): Promise<BranchItem> => {
    const { data } = await api.post<{ data: BranchItem }>(`/organizations/headquarters/${hqId}/branches`, payload);
    return data.data;
  },
  renameBranch: async (id: string, payload: { name: string }): Promise<BranchItem> => {
    const { data } = await api.patch<{ data: BranchItem }>(`/organizations/branches/${id}`, payload);
    return data.data;
  },
  deleteBranch: async (id: string): Promise<void> => {
    await api.delete(`/organizations/branches/${id}`);
  },

  // ── Branch → Substations ──
  listSubstations: async (branchId: string): Promise<BranchSubstationItem[]> => {
    const { data } = await api.get<{ data: BranchSubstationItem[] }>(`/organizations/branches/${branchId}/substations`);
    return data.data;
  },

  // ── Substation CRUD (existing endpoints) ──
  createSubstation: async (branchId: string, payload: { name: string; address?: string }): Promise<BranchSubstationItem> => {
    const { data } = await api.post<{ data: BranchSubstationItem }>('/substations', { ...payload, branchId });
    return data.data;
  },
  renameSubstation: async (id: string, payload: { name: string }): Promise<BranchSubstationItem> => {
    const { data } = await api.put<{ data: BranchSubstationItem }>(`/substations/${id}`, payload);
    return data.data;
  },
  deleteSubstation: async (id: string): Promise<void> => {
    await api.delete(`/substations/${id}`);
  },

  // ── Floors (existing endpoints) ──
  listFloors: async (substationId: string): Promise<FloorListItem[]> => {
    const { data } = await api.get<{ data: FloorListItem[] }>(`/substations/${substationId}/floors`);
    return data.data;
  },
  createFloor: async (substationId: string, payload: { name: string; floorNumber?: string }): Promise<FloorListItem> => {
    const { data } = await api.post<{ data: FloorListItem }>(`/substations/${substationId}/floors`, payload);
    return data.data;
  },
  renameFloor: async (id: string, payload: { name: string }): Promise<FloorListItem> => {
    const { data } = await api.put<{ data: FloorListItem }>(`/floors/${id}`, payload);
    return data.data;
  },
  deleteFloor: async (id: string): Promise<void> => {
    await api.delete(`/floors/${id}`);
  },

  // ── Reorder ──
  reorder: async (type: NodeType, items: { id: string; sortOrder: number }[]): Promise<void> => {
    await api.patch('/organizations/reorder', { type, items });
  },
};

/** Fetch children for a tree node — shared by TreePanel and TreeVisualization */
export async function fetchChildNodes(node: TreeNodeData): Promise<TreeNodeData[]> {
  if (node.type === 'headquarters') {
    const branches = await organizationApi.listBranches(node.id);
    return branches.map((b) => ({
      id: b.id, name: b.name, type: 'branch' as NodeType,
      parentId: node.id, children: [], childrenLoaded: false, expanded: false,
      meta: { substationCount: b.substationCount },
    }));
  }
  if (node.type === 'branch') {
    const subs = await organizationApi.listSubstations(node.id);
    return subs.map((s) => ({
      id: s.id, name: s.name, type: 'substation' as NodeType,
      parentId: node.id, children: [], childrenLoaded: false, expanded: false,
      meta: { floorCount: s.floorCount, address: s.address },
    }));
  }
  if (node.type === 'substation') {
    const floors = await organizationApi.listFloors(node.id);
    // Floor는 leaf — 클릭으로 에디터 진입, 자식 펼치지 않음
    return floors.map((f) => ({
      id: f.id, name: f.name, type: 'floor' as NodeType,
      parentId: node.id, children: [], childrenLoaded: true, expanded: false,
      meta: { floorNumber: f.floorNumber },
    }));
  }
  return [];
}

/** HeadquartersItem → root TreeNodeData (트리 초기 로드·본부 추가 후 갱신 공용 매핑, SSOT) */
export function hqToNode(hq: HeadquartersItem): TreeNodeData {
  return {
    id: hq.id,
    name: hq.name,
    type: 'headquarters',
    parentId: null,
    children: [],
    childrenLoaded: false,
    expanded: false,
    meta: { branchCount: hq.branchCount },
  };
}
