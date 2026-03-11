import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type { MaintenanceLog } from '../../../types/maintenance';
import type { MaintenanceFormData } from '../types/equipment';

const LOG_KEYS = {
  all: ['maintenance-logs'] as const,
  list: (equipmentId: string) =>
    [...LOG_KEYS.all, equipmentId] as const,
};

export function useMaintenanceLogs(equipmentId: string) {
  return useQuery({
    queryKey: LOG_KEYS.list(equipmentId),
    queryFn: async () => {
      const { data } = await api.get<{ data: MaintenanceLog[] }>(
        `/equipment/${equipmentId}/maintenance-logs`
      );
      return data.data;
    },
    enabled: !!equipmentId && !equipmentId.startsWith('temp-'),
  });
}

export function useCreateMaintenanceLog(equipmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (formData: MaintenanceFormData) => {
      const { data } = await api.post<{ data: MaintenanceLog }>(
        `/equipment/${equipmentId}/maintenance-logs`,
        formData
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: LOG_KEYS.list(equipmentId),
      });
    },
  });
}

export function useUpdateMaintenanceLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...formData
    }: MaintenanceFormData & { id: string }) => {
      const { data } = await api.put<{ data: MaintenanceLog }>(
        `/maintenance-logs/${id}`,
        formData
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LOG_KEYS.all });
    },
  });
}

export function useDeleteMaintenanceLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/maintenance-logs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LOG_KEYS.all });
    },
  });
}
