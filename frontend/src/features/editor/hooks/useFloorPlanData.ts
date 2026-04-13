import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type { FloorPlanDetail, UpdateFloorPlanRequest } from '../../../types/floorPlan';
import type { RoomDetail } from '../../../types/substation';
import type { RoomConnection } from '../../../types/connection';
import { useEditorStore, type LocalCable } from '../stores/editorStore';
import { useHistoryStore } from '../stores/historyStore';
import { useViewport } from './useViewport';
import { isTempId } from '../../../utils/idHelpers';

/**
 * Build temp equipment ID → real ID mapping from the backend response.
 */
function buildTempIdMap(
  equipmentIdMap: Record<string, string>
): Map<string, string> {
  return new Map(Object.entries(equipmentIdMap));
}

/**
 * Convert RoomConnection[] from backend into LocalCable[] for the editor store.
 */
function connectionsToLocalCables(connections: RoomConnection[]): LocalCable[] {
  return connections.map((conn) => ({
    id: conn.id,
    sourceEquipmentId: conn.sourceEquipmentId,
    targetEquipmentId: conn.targetEquipmentId,
    cableType: conn.cableType,
    materialCategoryId: conn.materialCategoryId ?? null,
    materialCategoryCode: conn.materialCategoryCode ?? null,
    displayColor: conn.displayColor ?? null,
    specParams: conn.specParams ?? null,
    pathPoints: conn.pathPoints ?? null,
    pathLength: conn.pathLength ?? null,
    totalLength: conn.totalLength ?? null,
    label: conn.label ?? null,
    color: conn.color ?? null,
    fiberPathId: conn.fiberPathId ?? null,
    fiberPortNumber: conn.fiberPortNumber ?? null,
  }));
}

/**
 * Hook for loading/saving floor plan data.
 * This is the SINGLE save path — all mutations flow through here.
 */
export function useFloorPlanData(roomId: string | undefined, containerRef: React.RefObject<HTMLDivElement | null>) {
  const [saveError, setSaveError] = useState<string | null>(null);
  const isSavingRef = useRef(false);
  const queryClient = useQueryClient();
  const {
    localElements, localEquipment, zoom, panX, panY,
    gridSize, majorGridSize,
    setLocalElements, setLocalEquipment, setGridSize, setMajorGridSize,
    setHasChanges, setViewportInitialized,
    setViewport, viewportInitialized,
  } = useEditorStore();
  const { initHistory } = useHistoryStore();
  const { fitToContent, loadViewportState, saveViewportState } = useViewport(roomId);

  const { data: room, isLoading: roomLoading } = useQuery({
    queryKey: ['room', roomId],
    queryFn: async () => {
      const response = await api.get<{ data: RoomDetail }>(`/rooms/${roomId}`);
      return response.data.data;
    },
    enabled: !!roomId,
  });

  const { data: floorPlan, isLoading: planLoading, error: planError } = useQuery({
    queryKey: ['floorPlan', roomId],
    queryFn: async () => {
      const response = await api.get<{ data: FloorPlanDetail }>(`/rooms/${roomId}/plan`);
      return response.data.data;
    },
    enabled: !!roomId,
    retry: false,
  });

  // Load connections (cables) for this room
  const { data: backendConnections } = useQuery({
    queryKey: ['room-connections', roomId],
    queryFn: async () => {
      const response = await api.get<{ data: RoomConnection[] }>(`/rooms/${roomId}/connections`);
      return response.data.data;
    },
    enabled: !!roomId,
  });

  // === THE SINGLE SAVE MUTATION ===
  const saveMutation = useMutation({
    mutationFn: (data: UpdateFloorPlanRequest) => {
      isSavingRef.current = true;
      return api.put<{ data: { id: string; version: number; equipmentIdMap: Record<string, string> } }>(
        `/rooms/${roomId}/plan`,
        data
      );
    },
    onSuccess: async (response) => {
      const equipmentIdMap = response.data?.data?.equipmentIdMap ?? {};
      const { pendingUploads, pendingLogs } = useEditorStore.getState();
      const tempIdMap = buildTempIdMap(equipmentIdMap);
      const resolveId = (id: string) => tempIdMap.get(id) ?? id;

      // Process pending uploads and logs in parallel
      const pendingTasks: Promise<void>[] = [];

      if (pendingUploads.length > 0) {
        pendingTasks.push(
          Promise.allSettled(
            pendingUploads.map(async (upload) => {
              const formData = new FormData();
              formData.append('file', upload.file);
              formData.append('side', upload.side);
              formData.append('takenAt', new Date().toISOString());
              if (upload.description) formData.append('description', upload.description);
              await api.post(`/equipment/${resolveId(upload.equipmentId)}/photos`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
              });
            })
          ).then((results) => {
            const failures = results.filter((r) => r.status === 'rejected');
            if (failures.length > 0) {
              console.warn(`[Save] ${failures.length} photo upload(s) failed:`, failures);
            }
          })
        );
      }

      if (pendingLogs.length > 0) {
        pendingTasks.push(
          Promise.allSettled(
            pendingLogs.map(async (log) => {
              await api.post(`/equipment/${resolveId(log.equipmentId)}/maintenance-logs`, {
                logType: log.logType,
                title: log.title,
                logDate: log.logDate || undefined,
                severity: log.severity || undefined,
                description: log.description || undefined,
              });
            })
          ).then((results) => {
            const failures = results.filter((r) => r.status === 'rejected');
            if (failures.length > 0) {
              console.warn(`[Save] ${failures.length} log creation(s) failed:`, failures);
            }
          })
        );
      }

      await Promise.all(pendingTasks);

      // Clear pending data and invalidate queries
      useEditorStore.getState().clearPendingData();

      // Delete localStorage draft on successful save
      if (roomId) {
        localStorage.removeItem(`draft-plan-${roomId}`);
      }

      queryClient.invalidateQueries({ queryKey: ['floorPlan', roomId] });
      queryClient.invalidateQueries({ queryKey: ['room-connections', roomId] });
      queryClient.invalidateQueries({ queryKey: ['fiber-paths'] });
      if (pendingUploads.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['equipment-photos'] });
      }
      if (pendingLogs.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['maintenance-logs'] });
      }
      setHasChanges(false);

      // Reset undo/redo history after successful save
      const { localElements: currentElements, localEquipment: currentEquipment, localCables: currentCables } = useEditorStore.getState();
      initHistory(currentElements, currentEquipment, currentCables);
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      const message = err?.response?.data?.message || err?.message || '저장에 실패했습니다.';
      setSaveError(message);
      setTimeout(() => setSaveError(null), 5000);
    },
  });

  // Load floor plan data into store (from server)
  useEffect(() => {
    if (!floorPlan) return;

    const elements = floorPlan.elements.map(e => ({
      ...e,
      isLocked: e.isLocked ?? false,
    }));

    setLocalElements(elements);
    setLocalEquipment(floorPlan.equipment);
    setGridSize(floorPlan.gridSize);
    setMajorGridSize(floorPlan.majorGridSize ?? 60);
    useEditorStore.getState().setScaleRatio(floorPlan.scaleRatio ?? null);

    if (isSavingRef.current) {
      isSavingRef.current = false;
      return;
    }

    // Fresh load (not after save): reset pending data + history
    useEditorStore.getState().clearPendingData();
    setHasChanges(false);
    initHistory(elements, floorPlan.equipment);
    setViewportInitialized(false);
  }, [floorPlan, roomId, setLocalElements, setLocalEquipment, setGridSize, setMajorGridSize, setHasChanges, initHistory, setViewportInitialized]);

  // Sync connections into store as localCables (only when not restoring a draft)
  useEffect(() => {
    if (backendConnections && !saveMutation.isPending && !useEditorStore.getState().hasChanges) {
      const cables = connectionsToLocalCables(backendConnections);
      useEditorStore.getState().setCables(cables);
    }
  }, [backendConnections]);

  // Viewport initialization
  useEffect(() => {
    if (!floorPlan || !containerRef.current || viewportInitialized) return;
    const container = containerRef.current;
    if (container.clientWidth === 0 || container.clientHeight === 0) return;

    const hasFloorPlanData = floorPlan.elements.length > 0 || floorPlan.equipment.length > 0;
    const hasLocalData = localElements.length > 0 || localEquipment.length > 0;
    if (hasFloorPlanData && !hasLocalData) return;

    const savedViewport = loadViewportState();
    if (savedViewport) {
      setViewport(savedViewport.zoom ?? 100, savedViewport.panX ?? 0, savedViewport.panY ?? 0);
    } else {
      fitToContent(localElements, localEquipment, container.clientWidth, container.clientHeight);
    }

    setViewportInitialized(true);
  }, [floorPlan, localElements, localEquipment, viewportInitialized, containerRef, fitToContent, loadViewportState, setViewport, setViewportInitialized]);

  // Save viewport on unmount
  useEffect(() => {
    const handleBeforeUnload = () => saveViewportState(zoom, panX, panY);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      saveViewportState(zoom, panX, panY);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [saveViewportState, zoom, panX, panY]);

  const handleSave = () => {
    if (!floorPlan) return;
    const { localCables, pendingFiberPaths, deletedFiberPathIds } = useEditorStore.getState();

    const currentScaleRatio = useEditorStore.getState().scaleRatio;
    const updateData: UpdateFloorPlanRequest = {
      canvasWidth: floorPlan.canvasWidth,
      canvasHeight: floorPlan.canvasHeight,
      gridSize,
      majorGridSize,
      scaleRatio: currentScaleRatio,
      elements: localElements.map(e => ({
        id: isTempId(e.id) ? null : e.id,
        elementType: e.elementType,
        properties: e.properties,
        zIndex: e.zIndex,
        isVisible: e.isVisible,
        materialCategoryId: e.materialCategoryId || undefined,
        specParams: e.specParams || undefined,
        pathLength: e.pathLength ?? undefined,
      })),
      equipment: localEquipment.map(eq => ({
        id: isTempId(eq.id) ? null : eq.id,
        tempId: isTempId(eq.id) ? eq.id : undefined,
        name: eq.name,
        category: eq.category || 'NETWORK',
        positionX: eq.positionX,
        positionY: eq.positionY,
        width: eq.width,
        height: eq.height,
        rotation: eq.rotation,
        description: eq.description || undefined,
        model: eq.model || undefined,
        manufacturer: eq.manufacturer || undefined,
        manager: eq.manager || undefined,
        materialCategoryId: eq.materialCategoryId || undefined,
        specParams: eq.specParams || undefined,
        parentEquipmentId: eq.parentEquipmentId || undefined,
        startU: eq.startU ?? undefined,
        heightU: eq.heightU ?? undefined,
      })),
      cables: localCables.map(c => ({
        id: isTempId(c.id) ? null : c.id,
        sourceEquipmentId: c.sourceEquipmentId,
        targetEquipmentId: c.targetEquipmentId,
        cableType: c.cableType,
        materialCategoryId: c.materialCategoryId,
        materialCategoryCode: c.materialCategoryCode,
        specParams: c.specParams,
        pathPoints: c.pathPoints,
        pathLength: c.pathLength,
        bufferLength: c.bufferLength,
        totalLength: c.totalLength,
        label: c.label,
        color: c.color,
        fiberPathId: c.fiberPathId,
        fiberPortNumber: c.fiberPortNumber,
      })),
      fiberPaths: pendingFiberPaths.length > 0 ? pendingFiberPaths.map((fp) => ({
        id: fp.id,
        ofdAId: fp.ofdAId,
        ofdBId: fp.ofdBId,
        portCount: fp.portCount,
        description: fp.description,
      })) : undefined,
      deletedFiberPathIds: deletedFiberPathIds.length > 0 ? deletedFiberPathIds : undefined,
    };

    saveMutation.mutate(updateData);
  };

  return {
    room,
    floorPlan,
    roomLoading,
    planLoading,
    planError,
    saveError,
    saveMutation,
    handleSave,
  };
}
