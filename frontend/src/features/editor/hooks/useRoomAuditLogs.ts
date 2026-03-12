import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import { useEditorStore } from '../stores/editorStore';
import { useHistoryStore } from '../stores/historyStore';
import type { AuditLog } from '../../../types/maintenance';
import type { FloorPlanDetail } from '../../../types/floorPlan';
import type { RoomConnection } from '../../../types/connection';

const AUDIT_KEYS = {
  all: ['room-audit-logs'] as const,
  list: (roomId: string) => [...AUDIT_KEYS.all, roomId] as const,
};

export function useRoomAuditLogs(roomId: string | undefined) {
  return useQuery({
    queryKey: AUDIT_KEYS.list(roomId!),
    queryFn: async () => {
      const { data } = await api.get<{ data: AuditLog[] }>(
        `/rooms/${roomId}/audit-logs`
      );
      return data.data;
    },
    enabled: !!roomId,
  });
}

export function useDeleteAuditLog(roomId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (logId: string) => {
      await api.delete(`/rooms/${roomId}/audit-logs/${logId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUDIT_KEYS.list(roomId!) });
    },
  });
}

interface SnapshotResponse {
  plan: FloorPlanDetail;
  cables: RoomConnection[];
}

export function useLoadSnapshot(roomId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (logId: string) => {
      const { data } = await api.get<{ data: SnapshotResponse }>(
        `/rooms/${roomId}/audit-logs/${logId}/snapshot`
      );
      return data.data;
    },
    onSuccess: (snapshot) => {
      if (!roomId) return;

      const store = useEditorStore.getState();
      const { initHistory } = useHistoryStore.getState();

      // Clear state
      store.clearChangeSet();
      store.clearSelection();
      store.setDetailPanelEquipmentId(null);

      // Cancel in-flight and freeze queries to prevent refetch overwriting snapshot
      queryClient.cancelQueries({ queryKey: ['floorPlan', roomId] });
      queryClient.cancelQueries({ queryKey: ['room-connections', roomId] });
      queryClient.setQueryDefaults(['floorPlan', roomId], { staleTime: Infinity });
      queryClient.setQueryDefaults(['room-connections', roomId], { staleTime: Infinity });

      // Set caches with snapshot data
      queryClient.setQueryData(['floorPlan', roomId], snapshot.plan);
      queryClient.setQueryData(['room-connections', roomId], snapshot.cables);

      // Override equipment detail caches
      for (const eq of snapshot.plan.equipment) {
        if (eq.id) {
          queryClient.setQueryDefaults(['equipment-detail', eq.id], { staleTime: Infinity });
          queryClient.setQueryData(['equipment-detail', eq.id], {
            id: eq.id, name: eq.name, category: eq.category,
            model: eq.model ?? null, manufacturer: eq.manufacturer ?? null,
            manager: eq.manager ?? null, description: eq.description ?? null,
            installDate: null,
            width2d: eq.width, height2d: eq.height,
            frontImageUrl: eq.frontImageUrl ?? null,
            rearImageUrl: eq.rearImageUrl ?? null,
          });
        }
      }

      // Load into editor store
      const elements = snapshot.plan.elements.map((e) => ({
        ...e,
        isLocked: false,
      }));
      store.setLocalElements(elements);
      store.setLocalEquipment(snapshot.plan.equipment);
      store.setGridSize(snapshot.plan.gridSize);
      store.setMajorGridSize(snapshot.plan.majorGridSize ?? 60);

      // Mark changed + reset undo
      store.setHasChanges(true);
      initHistory(elements, snapshot.plan.equipment);
    },
  });
}
