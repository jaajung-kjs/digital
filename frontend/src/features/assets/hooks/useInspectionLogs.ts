import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import { isTempId } from '../../../utils/idHelpers';
import type { InspectionLog, InspectionFormData } from '../../../types/inspection';

/**
 * 점검 이력(inspection_logs) 훅 — useMaintenanceLogs 미러.
 * mutate 시 점검 목록 + 자산 현황(nodeAssets) 목록 무효화 →
 * 가장 최근 점검일이 현황 "마지막 점검일"(lastMaintenanceDate)로 즉시 갱신.
 */
const INSPECTION_KEYS = {
  all: ['inspection-logs'] as const,
  list: (assetId: string) => [...INSPECTION_KEYS.all, assetId] as const,
};

/** mutate 후 점검 목록 + nodeAssets 현황(마지막 점검일) 동시 무효화. */
function invalidateInspectionAndNodes(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  queryClient.invalidateQueries({ queryKey: INSPECTION_KEYS.all });
  queryClient.invalidateQueries({ queryKey: ['nodeAssets'] });
}

export function useInspectionLogs(assetId: string) {
  return useQuery({
    queryKey: INSPECTION_KEYS.list(assetId),
    queryFn: async () => {
      const { data } = await api.get<{ data: InspectionLog[] }>(
        `/assets/${assetId}/inspections`,
      );
      return data.data;
    },
    enabled: !!assetId && !isTempId(assetId),
  });
}

export function useCreateInspectionLog(assetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (formData: InspectionFormData) => {
      const { data } = await api.post<{ data: InspectionLog }>(
        `/assets/${assetId}/inspections`,
        formData,
      );
      return data.data;
    },
    onSuccess: () => invalidateInspectionAndNodes(queryClient),
  });
}

export function useUpdateInspectionLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...formData
    }: Partial<InspectionFormData> & { id: string }) => {
      const { data } = await api.put<{ data: InspectionLog }>(
        `/inspection-logs/${id}`,
        formData,
      );
      return data.data;
    },
    onSuccess: () => invalidateInspectionAndNodes(queryClient),
  });
}

export function useDeleteInspectionLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/inspection-logs/${id}`);
    },
    onSuccess: () => invalidateInspectionAndNodes(queryClient),
  });
}
