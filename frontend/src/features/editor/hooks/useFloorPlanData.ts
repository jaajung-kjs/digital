import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type { FloorPlanDetail, UpdateFloorPlanRequest } from '../../../types/floorPlan';
import type { RoomDetail } from '../../../types/substation';
import { useEditorStore, type ChangeEntry } from '../stores/editorStore';
import { useHistoryStore } from '../stores/historyStore';
import { useViewport } from './useViewport';

/**
 * Build temp equipment ID → real ID mapping from the backend response.
 */
function buildTempIdMap(
  localEquipment: { id: string }[],
  equipmentIdMap: Record<number, string>
): Map<string, string> {
  const map = new Map<string, string>();
  localEquipment.forEach((eq, index) => {
    if (eq.id.startsWith('temp-') && equipmentIdMap[index]) {
      map.set(eq.id, equipmentIdMap[index]);
    }
  });
  return map;
}

/**
 * Process a single ChangeEntry into an API call.
 * This is the ONLY place where changeSet entries become real mutations.
 */
async function processChange(entry: ChangeEntry, resolveId: (id: string) => string) {
  switch (entry.type) {
    case 'photo:upload': {
      const formData = new FormData();
      formData.append('file', entry.file);
      formData.append('side', entry.side);
      formData.append('takenAt', new Date().toISOString());
      if (entry.description) formData.append('description', entry.description);
      await api.post(`/equipment/${resolveId(entry.equipmentId)}/photos`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      break;
    }
    case 'photo:delete':
      await api.delete(`/equipment-photos/${entry.photoId}`);
      break;
    case 'cable:create':
      await api.post('/cables', {
        sourceEquipmentId: resolveId(entry.sourceEquipmentId),
        targetEquipmentId: resolveId(entry.targetEquipmentId),
        cableType: entry.cableType,
        label: entry.label || undefined,
        length: entry.length || undefined,
        color: entry.color || undefined,
      });
      break;
    case 'cable:update':
      await api.put(`/cables/${entry.id}`, {
        sourceEquipmentId: resolveId(entry.sourceEquipmentId),
        targetEquipmentId: resolveId(entry.targetEquipmentId),
        cableType: entry.cableType,
        label: entry.label || undefined,
        length: entry.length || undefined,
        color: entry.color || undefined,
      });
      break;
    case 'cable:delete':
      await api.delete(`/cables/${entry.cableId}`);
      break;
    case 'log:create':
      await api.post(`/equipment/${resolveId(entry.equipmentId)}/maintenance-logs`, {
        logType: entry.logType,
        title: entry.title,
        logDate: entry.logDate || undefined,
        severity: entry.severity || undefined,
        description: entry.description || undefined,
      });
      break;
    case 'log:delete':
      await api.delete(`/maintenance-logs/${entry.logId}`);
      break;
  }
}

/**
 * Hook for loading/saving floor plan data.
 * This is the SINGLE save path — all mutations flow through here.
 */
export function useFloorPlanData(roomId: string | undefined, containerRef: React.RefObject<HTMLDivElement | null>) {
  const isSavingRef = useRef(false);
  const queryClient = useQueryClient();
  const {
    localElements, localEquipment, zoom, panX, panY,
    gridSize, majorGridSize, deletedElementIds, deletedEquipmentIds,
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

  // === THE SINGLE SAVE MUTATION ===
  const saveMutation = useMutation({
    mutationFn: (data: UpdateFloorPlanRequest) => {
      isSavingRef.current = true;
      return api.put<{ data: { id: string; version: number; equipmentIdMap: Record<number, string> } }>(
        `/rooms/${roomId}/plan`,
        data
      );
    },
    onSuccess: async (response) => {
      // 1. Build temp ID → real ID mapping
      const equipmentIdMap = response.data?.data?.equipmentIdMap ?? {};
      const { localEquipment: currentLocalEquipment, changeSet } = useEditorStore.getState();
      const tempIdMap = buildTempIdMap(currentLocalEquipment, equipmentIdMap);
      const resolveId = (id: string) => tempIdMap.get(id) ?? id;

      // 2. Process changeSet — deletions first (parallel), then creates/updates (parallel)
      const deletions = changeSet.filter((e) => e.type.endsWith(':delete'));
      const others = changeSet.filter((e) => !e.type.endsWith(':delete'));

      const failures: ChangeEntry[] = [];
      const run = async (entries: ChangeEntry[]) => {
        const results = await Promise.allSettled(
          entries.map((entry) => processChange(entry, resolveId))
        );
        results.forEach((r, i) => {
          if (r.status === 'rejected') failures.push(entries[i]);
        });
      };

      await run(deletions);
      await run(others);

      if (failures.length > 0) {
        console.warn(`[Save] ${failures.length} change(s) failed to process:`, failures);
      }

      // 3. Clear and invalidate (only relevant query keys)
      useEditorStore.getState().clearChangeSet();
      queryClient.invalidateQueries({ queryKey: ['floorPlan', roomId] });
      if (changeSet.some((e) => e.type.startsWith('photo:'))) {
        queryClient.invalidateQueries({ queryKey: ['equipment-photos'] });
      }
      if (changeSet.some((e) => e.type.startsWith('cable:'))) {
        queryClient.invalidateQueries({ queryKey: ['room-connections', roomId] });
        queryClient.invalidateQueries({ queryKey: ['connections'] });
      }
      if (changeSet.some((e) => e.type.startsWith('log:'))) {
        queryClient.invalidateQueries({ queryKey: ['maintenance-logs'] });
      }
      setHasChanges(false);
    },
  });

  // Load floor plan data into store
  useEffect(() => {
    if (floorPlan) {
      const draftKey = `floorplan-draft-${roomId}`;
      const draft = sessionStorage.getItem(draftKey);

      if (draft) {
        try {
          const { elements: draftElements, equipment: draftEquipment, hasChanges: savedHasChanges } = JSON.parse(draft);
          setLocalElements(draftElements);
          setLocalEquipment(draftEquipment);
          setHasChanges(savedHasChanges);
          sessionStorage.removeItem(draftKey);
          initHistory(draftElements, draftEquipment);
          return;
        } catch {
          sessionStorage.removeItem(draftKey);
        }
      }

      const elements = floorPlan.elements.map(e => ({
        ...e,
        isLocked: e.isLocked ?? false,
      }));

      setLocalElements(elements);
      setLocalEquipment(floorPlan.equipment);
      setGridSize(floorPlan.gridSize);
      setMajorGridSize(floorPlan.majorGridSize ?? 60);

      if (isSavingRef.current) {
        isSavingRef.current = false;
        return;
      }

      initHistory(elements, floorPlan.equipment);
      setViewportInitialized(false);
    }
  }, [floorPlan, roomId, setLocalElements, setLocalEquipment, setGridSize, setMajorGridSize, setHasChanges, initHistory, setViewportInitialized]);

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

    const updateData: UpdateFloorPlanRequest = {
      canvasWidth: floorPlan.canvasWidth,
      canvasHeight: floorPlan.canvasHeight,
      gridSize,
      majorGridSize,
      elements: localElements.map(e => ({
        id: e.id.startsWith('temp-') ? null : e.id,
        elementType: e.elementType,
        properties: e.properties,
        zIndex: e.zIndex,
        isVisible: e.isVisible,
      })),
      equipment: localEquipment.map(eq => ({
        id: eq.id.startsWith('temp-') ? null : eq.id,
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
      })),
      deletedElementIds: deletedElementIds.length > 0 ? deletedElementIds : undefined,
      deletedEquipmentIds: deletedEquipmentIds.length > 0 ? deletedEquipmentIds : undefined,
    };

    saveMutation.mutate(updateData);
  };

  return {
    room,
    floorPlan,
    roomLoading,
    planLoading,
    planError,
    saveMutation,
    handleSave,
  };
}
