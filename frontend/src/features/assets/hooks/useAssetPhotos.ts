import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type { EquipmentPhoto } from '../../../types/maintenance';

const KEYS = { list: (assetId: string) => ['asset-photos', assetId] as const };

export function useAssetPhotos(assetId: string) {
  return useQuery({
    queryKey: KEYS.list(assetId),
    queryFn: async () => {
      const { data } = await api.get<{ data: EquipmentPhoto[] }>(`/equipment/${assetId}/photos`);
      return data.data;
    },
    enabled: !!assetId,
  });
}

export function useUploadAssetPhoto(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (form: FormData) => {
      const { data } = await api.post<{ data: EquipmentPhoto }>(`/equipment/${assetId}/photos`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list(assetId) }),
  });
}

export function useDeleteAssetPhoto(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (photoId: string) => api.delete(`/equipment-photos/${photoId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list(assetId) }),
  });
}
