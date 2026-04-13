import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import { useEditorStore } from '../stores/editorStore';
import { useHistoryStore } from '../stores/historyStore';
import { useSnapshotStore } from '../stores/snapshotStore';
import type { AuditLog } from '../../../types/maintenance';
import type { FloorPlanDetail } from '../../../types/floorPlan';
import type { RoomConnection } from '../../../types/connection';
import type { SnapshotFiberPath } from '../stores/snapshotStore';

const AUDIT_KEYS = {
  all: ['room-audit-logs'] as const,
  list: (roomId: string) => [...AUDIT_KEYS.all, roomId] as const,
};

const DEFAULT_MAJOR_GRID_SIZE = 60;

interface SnapshotResponse {
  plan: FloorPlanDetail & { equipment: (FloorPlanDetail['equipment'][number] & { photos?: unknown[] })[] };
  cables: RoomConnection[];
  fiberPaths: SnapshotFiberPath[];
}

async function fetchSnapshot(roomId: string, logId: string): Promise<SnapshotResponse> {
  const { data } = await api.get<{ data: SnapshotResponse }>(
    `/rooms/${roomId}/audit-logs/${logId}/snapshot`
  );
  return data.data;
}

/** Clear editor selection and detail panel in one call */
function clearEditorFocus() {
  const store = useEditorStore.getState();
  store.clearSelection();
  store.setDetailPanelEquipmentId(null);
}

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

export function usePatchAuditLogContext(roomId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ logId, context }: { logId: string; context: Record<string, unknown> }) => {
      await api.patch(`/rooms/${roomId}/audit-logs/${logId}`, { context });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUDIT_KEYS.list(roomId!) });
    },
  });
}

/**
 * Preview a snapshot via the Snapshot Overlay — editor state is never touched.
 */
export function usePreviewSnapshot(roomId: string | undefined) {
  const mutation = useMutation({
    mutationFn: async (logId: string) => {
      if (!roomId) throw new Error('roomId is required');
      return fetchSnapshot(roomId, logId);
    },
  });

  const enter = async (logId: string, label: string) => {
    if (!roomId) return;
    const snapshot = await mutation.mutateAsync(logId);

    useSnapshotStore.getState().enter(logId, label, {
      elements: snapshot.plan.elements,
      equipment: snapshot.plan.equipment,
      cables: snapshot.cables,
      fiberPaths: snapshot.fiberPaths ?? [],
      gridSize: snapshot.plan.gridSize,
      majorGridSize: snapshot.plan.majorGridSize ?? DEFAULT_MAJOR_GRID_SIZE,
    });

    clearEditorFocus();
  };

  const exit = () => {
    useSnapshotStore.getState().exit();
  };

  return { enter, exit, isPending: mutation.isPending };
}

/**
 * Apply snapshot data into editor for actual editing (marks hasChanges).
 * Can accept data from the snapshot store to avoid a redundant API call.
 */
function applySnapshotToEditor(snapshot: SnapshotResponse, roomId: string, queryClient: ReturnType<typeof useQueryClient>) {
  const store = useEditorStore.getState();
  const { initHistory } = useHistoryStore.getState();

  useSnapshotStore.getState().exit();

  store.clearPendingData();
  clearEditorFocus();

  const elements = snapshot.plan.elements;
  store.setLocalElements(elements);
  store.setLocalEquipment(snapshot.plan.equipment);
  store.setGridSize(snapshot.plan.gridSize);
  store.setMajorGridSize(snapshot.plan.majorGridSize ?? DEFAULT_MAJOR_GRID_SIZE);

  store.setHasChanges(true);
  initHistory(elements, snapshot.plan.equipment);

  queryClient.invalidateQueries({ queryKey: ['floorPlan', roomId] });
  queryClient.invalidateQueries({ queryKey: ['room-connections', roomId] });
}

/**
 * Restore a snapshot: load into editor for actual editing.
 * If snapshot data is already in the store (from preview), reuses it — no extra API call.
 */
export function useLoadSnapshot(roomId: string | undefined) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (logId: string) => {
      if (!roomId) throw new Error('roomId is required');
      return fetchSnapshot(roomId, logId);
    },
    onSuccess: (snapshot) => {
      if (!roomId) return;
      applySnapshotToEditor(snapshot, roomId, queryClient);
    },
  });

  /** Restore from preview — reuses snapshot data already in the store */
  const restoreFromPreview = () => {
    if (!roomId) return;
    const snap = useSnapshotStore.getState();
    if (!snap.active || !snap.snapshotId) return;

    // Reconstruct SnapshotResponse from store data (fiberPaths not needed for editor restore)
    const snapshot: SnapshotResponse = {
      plan: {
        elements: snap.elements,
        equipment: snap.equipment,
        gridSize: snap.gridSize,
        majorGridSize: snap.majorGridSize,
      } as SnapshotResponse['plan'],
      cables: snap.cables,
      fiberPaths: snap.fiberPaths,
    };
    applySnapshotToEditor(snapshot, roomId, queryClient);
  };

  return { mutateAsync: mutation.mutateAsync, isPending: mutation.isPending, restoreFromPreview };
}
