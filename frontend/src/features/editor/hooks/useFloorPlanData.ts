import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type { FloorPlanDetail, UpdateFloorPlanRequest } from '../../../types/floorPlan';
import type { RoomDetail } from '../../../types/substation';
import { useEditorStore, selectChanges, type ChangeEntry } from '../stores/editorStore';
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
 * Process a single non-cable ChangeEntry into an API call.
 * Cables are now part of the bulk save request — only photos and logs go here.
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
    case 'log:create':
      await api.post(`/equipment/${resolveId(entry.equipmentId)}/maintenance-logs`, {
        logType: entry.logType,
        title: entry.title,
        logDate: entry.logDate || undefined,
        severity: entry.severity || undefined,
        description: entry.description || undefined,
      });
      break;
    case 'log:update':
      await api.put(`/maintenance-logs/${entry.logId}`, {
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
      return api.put<{ data: { id: string; version: number; equipmentIdMap: Record<string, string> } }>(
        `/rooms/${roomId}/plan`,
        data
      );
    },
    onSuccess: async (response) => {
      const equipmentIdMap = response.data?.data?.equipmentIdMap ?? {};
      const { changeSet } = useEditorStore.getState();
      const tempIdMap = buildTempIdMap(equipmentIdMap);
      const resolveId = (id: string) => tempIdMap.get(id) ?? id;

      // Process remaining changeSet (photos and logs only — cables already saved atomically)
      const nonCableChanges = changeSet.filter((e) => !e.type.startsWith('cable:'));
      if (nonCableChanges.length > 0) {
        const deletions = nonCableChanges.filter((e) => e.type.endsWith(':delete'));
        const others = nonCableChanges.filter((e) => !e.type.endsWith(':delete'));

        const run = async (entries: ChangeEntry[]) => {
          const results = await Promise.allSettled(
            entries.map((entry) => processChange(entry, resolveId))
          );
          const failures = results
            .map((r, i) => r.status === 'rejected' ? entries[i] : null)
            .filter(Boolean);
          if (failures.length > 0) {
            console.warn(`[Save] ${failures.length} change(s) failed:`, failures);
          }
        };
        await run(deletions);
        await run(others);
      }

      // Clear and invalidate
      useEditorStore.getState().clearChangeSet();
      queryClient.invalidateQueries({ queryKey: ['floorPlan', roomId] });
      queryClient.invalidateQueries({ queryKey: ['room-connections', roomId] });
      queryClient.invalidateQueries({ queryKey: ['fiber-paths'] });
      if (nonCableChanges.some((e) => e.type.startsWith('photo:'))) {
        queryClient.invalidateQueries({ queryKey: ['equipment-photos'] });
      }
      if (nonCableChanges.some((e) => e.type.startsWith('log:'))) {
        queryClient.invalidateQueries({ queryKey: ['maintenance-logs'] });
      }
      setHasChanges(false);

      // Reset undo/redo history after successful save
      const { localElements: currentElements, localEquipment: currentEquipment } = useEditorStore.getState();
      initHistory(currentElements, currentEquipment);
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
    const { changeSet } = useEditorStore.getState();

    // Build cable payload from changeSet
    const allDeletions = new Set(selectChanges(changeSet, 'cable:delete').map((c) => c.cableId));
    const cableCreates = selectChanges(changeSet, 'cable:create')
      .filter((c) => !allDeletions.has(c.localId))
      .map((c) => ({
        sourceEquipmentId: c.sourceEquipmentId,
        targetEquipmentId: c.targetEquipmentId,
        cableType: c.cableType,
        materialCategoryId: c.materialCategoryId,
        label: c.label, length: c.length, color: c.color,
        fiberPathId: c.fiberPathId, fiberPortNumber: c.fiberPortNumber,
        pathPoints: c.pathPoints,
      }));
    const cableUpdates = selectChanges(changeSet, 'cable:update')
      .filter((c) => !allDeletions.has(c.id))
      .map((c) => ({
        id: c.id,
        sourceEquipmentId: c.sourceEquipmentId,
        targetEquipmentId: c.targetEquipmentId,
        cableType: c.cableType,
        materialCategoryId: c.materialCategoryId,
        label: c.label, length: c.length, color: c.color,
        fiberPathId: c.fiberPathId, fiberPortNumber: c.fiberPortNumber,
        pathPoints: c.pathPoints,
      }));
    const deletedCableIds = [...allDeletions].filter((id) => !isTempId(id));

    const cables = [...cableCreates, ...cableUpdates];

    const updateData: UpdateFloorPlanRequest = {
      canvasWidth: floorPlan.canvasWidth,
      canvasHeight: floorPlan.canvasHeight,
      gridSize,
      majorGridSize,
      elements: localElements.map(e => ({
        id: isTempId(e.id) ? null : e.id,
        elementType: e.elementType,
        properties: e.properties,
        zIndex: e.zIndex,
        isVisible: e.isVisible,
      })),
      equipment: localEquipment.map(eq => ({
        id: isTempId(eq.id) ? null : eq.id,
        tempId: isTempId(eq.id) ? eq.id : undefined,
        name: eq.name,
        category: eq.category || 'NETWORK',
        materialCategoryId: eq.materialCategoryId || undefined,
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
      cables: cables.length > 0 ? cables : undefined,
      deletedElementIds: deletedElementIds.length > 0 ? deletedElementIds : undefined,
      deletedEquipmentIds: deletedEquipmentIds.length > 0 ? deletedEquipmentIds : undefined,
      deletedCableIds: deletedCableIds.length > 0 ? deletedCableIds : undefined,
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
