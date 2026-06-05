import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type { MaintenanceLog } from '../../../types/maintenance';

const KEYS = { list: (assetId: string) => ['asset-maintenance-logs', assetId] as const };

export function useAssetMaintenanceLogs(assetId: string) {
  return useQuery({
    queryKey: KEYS.list(assetId),
    queryFn: async () => {
      const { data } = await api.get<{ data: MaintenanceLog[] }>(`/equipment/${assetId}/maintenance-logs`);
      return data.data;
    },
    enabled: !!assetId,
  });
}

export function useCreateAssetMaintenanceLog(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      logType: string;
      title: string;
      description?: string;
      logDate?: string;
      severity?: string;
      status?: string;
    }) => {
      const { data } = await api.post<{ data: MaintenanceLog }>(
        `/equipment/${assetId}/maintenance-logs`,
        payload
      );
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list(assetId) }),
  });
}
