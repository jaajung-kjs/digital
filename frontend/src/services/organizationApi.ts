import { api } from '../utils/api';
import type { HeadquartersItem, BranchItem, BranchSubstationItem, FloorListItem, RoomItem } from '../types';
import type { TreeNodeData, NodeType } from '../types/organization';

export const organizationApi = {
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
    const { data } = await api.patch<{ data: BranchSubstationItem }>(`/substations/${id}`, payload);
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
    const { data } = await api.patch<{ data: FloorListItem }>(`/floors/${id}`, payload);
    return data.data;
  },
  deleteFloor: async (id: string): Promise<void> => {
    await api.delete(`/floors/${id}`);
  },

  // ── Rooms ──
  listRooms: async (floorId: string): Promise<RoomItem[]> => {
    const { data } = await api.get<{ data: RoomItem[] }>(`/floors/${floorId}/rooms`);
    return data.data;
  },
  createRoom: async (floorId: string, payload: { name: string }): Promise<RoomItem> => {
    const { data } = await api.post<{ data: RoomItem }>(`/floors/${floorId}/rooms`, payload);
    return data.data;
  },
  renameRoom: async (id: string, payload: { name: string }): Promise<RoomItem> => {
    const { data } = await api.patch<{ data: RoomItem }>(`/rooms/${id}`, payload);
    return data.data;
  },
  deleteRoom: async (id: string): Promise<void> => {
    await api.delete(`/rooms/${id}`);
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
    return floors.map((f) => ({
      id: f.id, name: f.name, type: 'floor' as NodeType,
      parentId: node.id, children: [], childrenLoaded: false, expanded: false,
      meta: { floorNumber: f.floorNumber, roomCount: f.roomCount },
    }));
  }
  if (node.type === 'floor') {
    const rooms = await organizationApi.listRooms(node.id);
    return rooms.map((r) => ({
      id: r.id, name: r.name, type: 'room' as NodeType,
      parentId: node.id, children: [], childrenLoaded: true, expanded: false,
      meta: {},
    }));
  }
  return [];
}
