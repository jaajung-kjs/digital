import { api } from '../utils/api';
import type { Asset, AssetType, CreateAssetInput, UpdateAssetInput } from '../types/asset';

export const assetApi = {
  listTypes: async (): Promise<AssetType[]> => {
    const { data } = await api.get<{ data: AssetType[] }>('/asset-types');
    return data.data;
  },
  getById: async (id: string): Promise<Asset> => {
    const { data } = await api.get<{ data: Asset }>(`/assets/${id}`);
    return data.data;
  },
  listBySubstation: async (substationId: string): Promise<Asset[]> => {
    const { data } = await api.get<{ data: Asset[] }>(`/substations/${substationId}/assets`);
    return data.data;
  },
  create: async (payload: CreateAssetInput): Promise<Asset> => {
    const { data } = await api.post<{ data: Asset }>('/assets', payload);
    return data.data;
  },
  update: async (id: string, payload: UpdateAssetInput): Promise<Asset> => {
    const { data } = await api.put<{ data: Asset }>(`/assets/${id}`, payload);
    return data.data;
  },
  remove: async (id: string): Promise<void> => {
    await api.delete(`/assets/${id}`);
  },
  duplicate: async (id: string): Promise<Asset> => {
    const { data } = await api.post<{ data: Asset }>(`/assets/${id}/duplicate`, {});
    return data.data;
  },
  commit: async (substationId: string, body: unknown): Promise<{ idMap: Record<string, string>; updated: { id: string; updatedAt: string }[] }> => {
    const { data } = await api.post<{ data: { idMap: Record<string, string>; updated: { id: string; updatedAt: string }[] } }>(`/substations/${substationId}/assets/commit`, body);
    return data.data;
  },
};
