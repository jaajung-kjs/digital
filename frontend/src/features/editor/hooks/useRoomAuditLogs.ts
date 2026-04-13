import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import { useEditorStore } from '../stores/editorStore';
import { useHistoryStore } from '../stores/historyStore';
import { useSnapshotStore } from '../stores/snapshotStore';
import type { AuditLog } from '../../../types/maintenance';
import type { FloorPlanDetail } from '../../../types/floorPlan';

const VERSION_KEYS = {
  all: ['room-versions'] as const,
  list: (roomId: string) => [...VERSION_KEYS.all, roomId] as const,
};

const DEFAULT_MAJOR_GRID_SIZE = 60;

/**
 * Fetch a past version of the plan. The response has the SAME structure
 * as the current plan (FloorPlanDetail) — cables and fiberPaths included.
 */
async function fetchVersionPlan(roomId: string, version: number): Promise<FloorPlanDetail> {
  const { data } = await api.get<{ data: FloorPlanDetail }>(
    `/rooms/${roomId}/plan?version=${version}`
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
    queryKey: VERSION_KEYS.list(roomId!),
    queryFn: async () => {
      const { data } = await api.get<{ data: AuditLog[] }>(
        `/rooms/${roomId}/versions`
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
      await api.delete(`/rooms/${roomId}/versions/${logId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VERSION_KEYS.list(roomId!) });
    },
  });
}

export function usePatchAuditLogContext(roomId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ logId, context }: { logId: string; context: Record<string, unknown> }) => {
      await api.patch(`/rooms/${roomId}/versions/${logId}`, { context });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VERSION_KEYS.list(roomId!) });
    },
  });
}

/**
 * Preview a past version via the Snapshot Overlay — editor state is never touched.
 * Uses the same plan API with a version query parameter.
 */
export function usePreviewSnapshot(roomId: string | undefined) {
  const mutation = useMutation({
    mutationFn: async ({ version }: { version: number }) => {
      if (!roomId) throw new Error('roomId is required');
      return fetchVersionPlan(roomId, version);
    },
  });

  const enter = async (logId: string, label: string, version: number) => {
    if (!roomId) return;
    const plan = await mutation.mutateAsync({ version });

    useSnapshotStore.getState().enter(logId, label, {
      elements: plan.elements,
      equipment: plan.equipment,
      cables: plan.cables ?? [],
      fiberPaths: plan.fiberPaths ?? [],
      gridSize: plan.gridSize,
      majorGridSize: plan.majorGridSize ?? DEFAULT_MAJOR_GRID_SIZE,
    });

    clearEditorFocus();
  };

  const exit = () => {
    useSnapshotStore.getState().exit();
  };

  return { enter, exit, isPending: mutation.isPending };
}

/**
 * Apply plan data into editor for actual editing (marks hasChanges).
 * Accepts the unified FloorPlanDetail shape (same for current and past versions).
 */
function applyPlanToEditor(plan: FloorPlanDetail) {
  const store = useEditorStore.getState();
  const { initHistory } = useHistoryStore.getState();

  useSnapshotStore.getState().exit();

  store.clearPendingData();
  clearEditorFocus();

  const elements = plan.elements;
  store.setLocalElements(elements);
  store.setLocalEquipment(plan.equipment);

  // Restore cables from plan data
  const cables = (plan.cables ?? []).map((c) => ({
    id: c.id ?? '',
    sourceEquipmentId: c.sourceEquipmentId ?? '',
    targetEquipmentId: c.targetEquipmentId ?? '',
    cableType: c.cableType ?? 'LAN',
    materialCategoryId: c.materialCategoryId ?? undefined,
    materialCategoryCode: c.materialCategoryCode ?? undefined,
    specParams: c.specParams ?? undefined,
    pathPoints: c.pathPoints ?? undefined,
    pathLength: c.pathLength ?? undefined,
    bufferLength: 4,
    totalLength: c.totalLength ?? undefined,
    label: c.label ?? undefined,
    color: c.color ?? undefined,
    displayColor: c.displayColor ?? undefined,
    fiberPathId: c.fiberPathId ?? undefined,
    fiberPortNumber: c.fiberPortNumber ?? undefined,
  }));
  store.setCables(cables);

  store.setGridSize(plan.gridSize);
  store.setMajorGridSize(plan.majorGridSize ?? DEFAULT_MAJOR_GRID_SIZE);

  store.setHasChanges(true);
  initHistory(elements, plan.equipment);
}

/**
 * Restore a past version: load into editor for actual editing.
 * If plan data is already in the store (from preview), reuses it — no extra API call.
 */
export function useLoadSnapshot(roomId: string | undefined) {
  const mutation = useMutation({
    mutationFn: async (version: number) => {
      if (!roomId) throw new Error('roomId is required');
      return fetchVersionPlan(roomId, version);
    },
    onSuccess: (plan) => {
      applyPlanToEditor(plan);
    },
  });

  /** Restore from preview — reuses plan data already in the snapshot store */
  const restoreFromPreview = () => {
    if (!roomId) return;
    const snap = useSnapshotStore.getState();
    if (!snap.active || !snap.snapshotId) return;

    const versionLabel = snap.label ?? '이전 버전';

    // Reconstruct FloorPlanDetail from store data
    const plan = {
      elements: snap.elements,
      equipment: snap.equipment,
      cables: snap.cables,
      fiberPaths: snap.fiberPaths,
      gridSize: snap.gridSize,
      majorGridSize: snap.majorGridSize,
    } as FloorPlanDetail;
    applyPlanToEditor(plan);

    // Show restore banner in editor
    useEditorStore.getState().setRestoredFromVersion(versionLabel);
  };

  return { mutateAsync: mutation.mutateAsync, isPending: mutation.isPending, restoreFromPreview };
}
