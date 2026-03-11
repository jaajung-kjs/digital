import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type { FloorPlanDetail, UpdateFloorPlanRequest } from '../../../types/floorPlan';
import type { RoomDetail } from '../../../types/substation';
import { useEditorStore } from '../stores/editorStore';
import { useHistoryStore } from '../stores/historyStore';
import { useViewport } from './useViewport';

/**
 * Hook for loading/saving floor plan data via TanStack Query
 */
export function useFloorPlanData(roomId: string | undefined, containerRef: React.RefObject<HTMLDivElement | null>) {
  const isSavingRef = useRef(false);
  const queryClient = useQueryClient();
  const {
    localElements, localEquipment, zoom, panX, panY,
    gridSize, majorGridSize, deletedElementIds, deletedEquipmentIds,
    setLocalElements, setLocalEquipment, setGridSize, setMajorGridSize,
    setHasChanges, clearDeletedIds, setViewportInitialized,
    setViewport, viewportInitialized,
  } = useEditorStore();
  const { initHistory } = useHistoryStore();
  const { fitToContent, loadViewportState, saveViewportState } = useViewport(roomId);

  // Room info query
  const { data: room, isLoading: roomLoading } = useQuery({
    queryKey: ['room', roomId],
    queryFn: async () => {
      const response = await api.get<{ data: RoomDetail }>(`/rooms/${roomId}`);
      return response.data.data;
    },
    enabled: !!roomId,
  });

  // Floor plan query
  const { data: floorPlan, isLoading: planLoading, error: planError } = useQuery({
    queryKey: ['floorPlan', roomId],
    queryFn: async () => {
      const response = await api.get<{ data: FloorPlanDetail }>(`/rooms/${roomId}/plan`);
      return response.data.data;
    },
    enabled: !!roomId,
    retry: false,
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (data: UpdateFloorPlanRequest) => {
      isSavingRef.current = true;
      return api.put(`/rooms/${roomId}/plan`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['floorPlan', roomId] });
      setHasChanges(false);
      clearDeletedIds();
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

  // Save viewport state on unmount
  useEffect(() => {
    const handleBeforeUnload = () => saveViewportState(zoom, panX, panY);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      saveViewportState(zoom, panX, panY);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [saveViewportState, zoom, panX, panY]);

  // Save handler
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
        category: eq.category || 'OTHER',
        positionX: eq.positionX,
        positionY: eq.positionY,
        width: eq.width,
        height: eq.height,
        rotation: eq.rotation,
        description: eq.description || undefined,
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
