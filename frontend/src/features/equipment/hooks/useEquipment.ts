import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type { EquipmentItem } from '../../../types/floorPlan';
import type { EquipmentFormData } from '../types/equipment';

const EQUIPMENT_KEYS = {
  all: ['equipment'] as const,
  room: (roomId: string) => [...EQUIPMENT_KEYS.all, 'room', roomId] as const,
  detail: (id: string) => [...EQUIPMENT_KEYS.all, 'detail', id] as const,
};

export function useRoomEquipment(roomId: string) {
  return useQuery({
    queryKey: EQUIPMENT_KEYS.room(roomId),
    queryFn: async () => {
      const { data } = await api.get<{ data: EquipmentItem[] }>(
        `/rooms/${roomId}/equipment`
      );
      return data.data;
    },
    enabled: !!roomId,
  });
}

export function useEquipmentDetail(id: string) {
  return useQuery({
    queryKey: EQUIPMENT_KEYS.detail(id),
    queryFn: async () => {
      const { data } = await api.get<{ data: EquipmentItem }>(
        `/equipment/${id}`
      );
      return data.data;
    },
    enabled: !!id,
  });
}

export function useCreateEquipment(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (formData: EquipmentFormData) => {
      const { data } = await api.post<{ data: EquipmentItem }>(
        `/rooms/${roomId}/equipment`,
        formData
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EQUIPMENT_KEYS.room(roomId) });
    },
  });
}

export function useUpdateEquipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...formData
    }: EquipmentFormData & { id: string }) => {
      const { data } = await api.put<{ data: EquipmentItem }>(
        `/equipment/${id}`,
        formData
      );
      return data.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: EQUIPMENT_KEYS.detail(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: EQUIPMENT_KEYS.all });
    },
  });
}

export function useDeleteEquipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/equipment/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EQUIPMENT_KEYS.all });
    },
  });
}
