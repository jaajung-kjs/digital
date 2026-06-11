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
};
