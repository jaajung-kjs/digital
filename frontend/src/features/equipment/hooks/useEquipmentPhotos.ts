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

// 사진 삭제는 즉시 api.delete 가 아니라 워킹카피 staging(substationStore remove('photos', id))으로만.
// C2 위반이던 useDeletePhoto(즉시 DELETE)는 제거 — 저장 시 flushPendingMedia 가 DELETE flush.
