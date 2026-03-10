import { api } from '../utils/api';
import type { HeadquartersItem, BranchItem, BranchSubstationItem, FloorListItem, RoomItem } from '../types';

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
  createSubstation: async (branchId: string, payload: { name: string; address?: string }): Promise<any> => {
    const { data } = await api.post<{ data: any }>('/substations', { ...payload, branchId });
    return data.data;
  },
  renameSubstation: async (id: string, payload: { name: string }): Promise<any> => {
    const { data } = await api.put<{ data: any }>(`/substations/${id}`, payload);
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
  createFloor: async (substationId: string, payload: { name: string; floorNumber?: string }): Promise<any> => {
    const { data } = await api.post<{ data: any }>(`/substations/${substationId}/floors`, payload);
    return data.data;
  },
  renameFloor: async (id: string, payload: { name: string }): Promise<any> => {
    const { data } = await api.put<{ data: any }>(`/floors/${id}`, payload);
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
  renameRoom: async (id: string, payload: { name: string }): Promise<any> => {
    const { data } = await api.put<{ data: any }>(`/rooms/${id}`, payload);
    return data.data;
  },
  deleteRoom: async (id: string): Promise<void> => {
    await api.delete(`/rooms/${id}`);
  },

  // ── Reorder ──
  reorder: async (type: string, items: { id: string; sortOrder: number }[]): Promise<void> => {
    await api.patch('/organizations/reorder', { type, items });
  },
};
