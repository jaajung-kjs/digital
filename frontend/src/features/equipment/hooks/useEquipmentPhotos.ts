import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import { isTempId } from '../../../utils/idHelpers';
import type { EquipmentPhoto } from '../../../types/maintenance';

const PHOTO_KEYS = {
  all: ['equipment-photos'] as const,
  list: (equipmentId: string) =>
    [...PHOTO_KEYS.all, equipmentId] as const,
};

export function useEquipmentPhotos(equipmentId: string) {
  return useQuery({
    queryKey: PHOTO_KEYS.list(equipmentId),
    queryFn: async () => {
      const { data } = await api.get<{ data: EquipmentPhoto[] }>(
        `/equipment/${equipmentId}/photos`
      );
      return data.data;
    },
    enabled: !!equipmentId && !isTempId(equipmentId),
  });
}

export function useUploadPhoto(equipmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (formData: FormData) => {
      const { data } = await api.post<{ data: EquipmentPhoto }>(
        `/equipment/${equipmentId}/photos`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
        }
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: PHOTO_KEYS.list(equipmentId),
      });
    },
  });
}

export function useDeletePhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/equipment-photos/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PHOTO_KEYS.all });
    },
  });
}
