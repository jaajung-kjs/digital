import { api } from '../utils/api';
import type { Asset, AssetType } from '../types/asset';

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
  commit: async (substationId: string, body: unknown): Promise<{ idMap: Record<string, string>; updated: { id: string; updatedAt: string }[] }> => {
    const { data } = await api.post<{ data: { idMap: Record<string, string>; updated: { id: string; updatedAt: string }[] } }>(`/substations/${substationId}/assets/commit`, body);
    return data.data;
  },
};
