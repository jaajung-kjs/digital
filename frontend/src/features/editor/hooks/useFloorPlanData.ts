import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type {
  FloorPlanDetail,
  FloorPlanCable,
  UpdateFloorPlanRequest,
  BulkUpdatePlanResponse,
} from '../../../types/floorPlan';
import type { FloorDetail } from '../../../types/substation';
import type { RackModule } from '../../../types/rackModule';
import { useEditorStore, type LocalCable } from '../stores/editorStore';
import { useViewport } from './useViewport';
import { isTempId } from '../../../utils/idHelpers';
import { RACK_MODULE_KEYS } from '../../rack/hooks/useRackModules';

/**
 * Build temp equipment ID → real ID mapping from the backend response.
 */
function buildTempIdMap(
  equipmentIdMap: Record<string, string>
): Map<string, string> {
  return new Map(Object.entries(equipmentIdMap));
}

/**
 * Convert FloorPlanCable[] from the plan response into LocalCable[] for the editor store.
 *
 * P8: backend now returns polymorphic source/target (equipmentId | moduleId).
 * `LocalCable.sourceEquipmentId / targetEquipmentId` is still required for the
 * canvas hit testing path — for module-only endpoints we fall back to the rack
 * equipment id ('' if missing) until P9 wires real RackModule positions.
 */
function planCablesToLocalCables(cables: FloorPlanCable[]): LocalCable[] {
  return cables.map((c) => ({
    id: c.id,
    sourceEquipmentId: c.sourceEquipmentId ?? c.sourceModuleId ?? '',
    targetEquipmentId: c.targetEquipmentId ?? c.targetModuleId ?? '',
    sourceModuleId: c.sourceModuleId ?? null,
    targetModuleId: c.targetModuleId ?? null,
    cableType: c.cableType,
    categoryId: c.categoryId ?? null,
    categoryCode: c.categoryCode ?? null,
    categoryName: c.categoryName ?? null,
    displayColor: c.displayColor ?? null,
    specParams: c.specParams ?? null,
    specification: c.specification ?? null,
    pathPoints: c.pathPoints ?? null,
    pathLength: c.pathLength ?? null,
    totalLength: c.totalLength ?? null,
    label: c.label ?? null,
    color: c.color ?? null,
    fiberPathId: c.fiberPathId ?? null,
    fiberPortNumber: c.fiberPortNumber ?? null,
  }));
}

/**
 * Hook for loading/saving floor plan data.
 * This is the SINGLE save path — all mutations flow through here.
 */
export function useFloorPlanData(floorId: string | undefined, containerRef: React.RefObject<HTMLDivElement | null>) {
  const [saveError, setSaveError] = useState<string | null>(null);
  const isSavingRef = useRef(false);
  const queryClient = useQueryClient();
  const {
    localEquipment, zoom, panX, panY,
    gridSize, majorGridSize,
    setLocalEquipment, setGridSize, setMajorGridSize,
    setHasChanges, setViewportInitialized,
    setViewport, viewportInitialized,
    initHistory,
  } = useEditorStore();
  const { fitToContent, loadViewportState, saveViewportState } = useViewport(floorId);

  const { data: floor, isLoading: floorLoading } = useQuery({
    queryKey: ['floor', floorId],
    queryFn: async () => {
      const response = await api.get<{ data: FloorDetail }>(`/floors/${floorId}`);
      return response.data.data;
    },
    enabled: !!floorId,
  });

  const { data: floorPlan, isLoading: planLoading, error: planError } = useQuery({
    queryKey: ['floorPlan', floorId],
    queryFn: async () => {
      const response = await api.get<{ data: FloorPlanDetail }>(`/floors/${floorId}/plan`);
      return response.data.data;
    },
    enabled: !!floorId,
    retry: false,
  });

  // === THE SINGLE SAVE MUTATION ===
  const saveMutation = useMutation({
    mutationFn: (data: UpdateFloorPlanRequest) => {
      isSavingRef.current = true;
      return api.put<{ data: BulkUpdatePlanResponse }>(
        `/floors/${floorId}/plan`,
        data
      );
    },
    onSuccess: async (response) => {
      const equipmentIdMap = response.data?.data?.equipmentIdMap ?? {};
      // P9: tempId → real id maps for both equipment and rack modules.
      const rackModuleIdMap = response.data?.data?.rackModuleIdMap ?? {};
      const { pendingUploads, pendingLogs } = useEditorStore.getState();
      const tempIdMap = buildTempIdMap(equipmentIdMap);
      const moduleIdMap = buildTempIdMap(rackModuleIdMap);
      const resolveId = (id: string) => tempIdMap.get(id) ?? id;
      const resolveModuleId = (id: string) => moduleIdMap.get(id) ?? id;

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

      // Construction report is computed server-side and stored in the audit
      // log context atomically with the save — no extra round-trip needed.

      // P9: rewrite tempId references in localCables / localRackModules so the
      // store reflects real ids without an extra round-trip.
      const { localCables: cablesAfterSave, localRackModules: modulesAfterSave } = useEditorStore.getState();
      useEditorStore.getState().setCables(cablesAfterSave.map((c) => ({
        ...c,
        sourceEquipmentId: resolveId(c.sourceEquipmentId),
        targetEquipmentId: resolveId(c.targetEquipmentId),
        sourceModuleId: c.sourceModuleId ? resolveModuleId(c.sourceModuleId) : null,
        targetModuleId: c.targetModuleId ? resolveModuleId(c.targetModuleId) : null,
      })));
      useEditorStore.getState().setRackModules(modulesAfterSave.map((m) => ({
        ...m,
        id: resolveModuleId(m.id),
        rackEquipmentId: resolveId(m.rackEquipmentId),
      })));

      // Clear pending data and invalidate queries
      useEditorStore.getState().clearPendingData();

      // Delete localStorage draft on successful save
      if (floorId) {
        localStorage.removeItem(`draft-plan-${floorId}`);
      }

      queryClient.invalidateQueries({ queryKey: ['floorPlan', floorId] });
      queryClient.invalidateQueries({ queryKey: ['fiber-paths'] });
      queryClient.invalidateQueries({ queryKey: RACK_MODULE_KEYS.all });
      if (pendingUploads.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['equipment-photos'] });
      }
      if (pendingLogs.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['maintenance-logs'] });
      }
      setHasChanges(false);
      useEditorStore.getState().setRestoredFromVersion(null);

      // Reset undo/redo history after successful save
      const { localEquipment: currentEquipment, localCables: currentCables } = useEditorStore.getState();
      initHistory(currentEquipment, currentCables);
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      const message = err?.response?.data?.message || err?.message || '저장에 실패했습니다.';
      setSaveError(message);
      setTimeout(() => setSaveError(null), 5000);
    },
  });

  // P9: aggregate rack modules across all rack equipment on the floor.
  const rackEquipmentIds = (floorPlan?.equipment ?? [])
    .filter((eq) => eq.kind === 'RACK')
    .map((eq) => eq.id)
    .sort()
    .join('|');

  const { data: aggregateRackModules } = useQuery({
    queryKey: ['floorPlan-rack-modules', floorId, rackEquipmentIds],
    queryFn: async () => {
      const ids = rackEquipmentIds.split('|').filter(Boolean);
      if (ids.length === 0) return [] as RackModule[];
      const results = await Promise.all(
        ids.map((id) =>
          api
            .get<{ data: RackModule[] }>('/rack-modules', { params: { rackId: id } })
            .then((r) => r.data.data)
            .catch(() => [] as RackModule[]),
        ),
      );
      return results.flat();
    },
    enabled: !!floorPlan && rackEquipmentIds.length > 0,
    staleTime: 1000 * 30,
  });

  // Load floor plan data into store (from server)
  useEffect(() => {
    if (!floorPlan) return;

    const cables = planCablesToLocalCables(floorPlan.cables ?? []);

    setLocalEquipment(floorPlan.equipment);
    useEditorStore.getState().setCables(cables);
    setGridSize(floorPlan.gridSize);
    setMajorGridSize(floorPlan.majorGridSize ?? 60);
    // CM-B: scaleRatio 더 이상 동기화하지 않음 — 캔버스 1 unit = 1 cm 통일.

    if (isSavingRef.current) {
      isSavingRef.current = false;
      return;
    }

    useEditorStore.getState().clearPendingData();
    setHasChanges(false);
    initHistory(floorPlan.equipment, cables);
    setViewportInitialized(false);
  }, [floorPlan, floorId, setLocalEquipment, setGridSize, setMajorGridSize, setHasChanges, initHistory, setViewportInitialized]);

  // P9: seed `localRackModules` once the aggregate fetch lands. The hook above
  // re-runs whenever the rack equipment id set changes, so the working copy
  // stays in sync with the server snapshot until the user edits modules.
  useEffect(() => {
    if (!aggregateRackModules) return;
    useEditorStore.getState().setRackModules(aggregateRackModules);
  }, [aggregateRackModules]);

  // Viewport initialization
  useEffect(() => {
    if (!floorPlan || !containerRef.current || viewportInitialized) return;
    const container = containerRef.current;
    if (container.clientWidth === 0 || container.clientHeight === 0) return;

    if (floorPlan.equipment.length > 0 && localEquipment.length === 0) return;

    const savedViewport = loadViewportState();
    if (savedViewport) {
      setViewport(savedViewport.zoom ?? 100, savedViewport.panX ?? 0, savedViewport.panY ?? 0);
    } else {
      fitToContent(
        localEquipment,
        floorPlan.backgroundDrawing,
        { width: floorPlan.canvasWidth, height: floorPlan.canvasHeight },
        container.clientWidth,
        container.clientHeight,
      );
    }

    setViewportInitialized(true);
  }, [floorPlan, localEquipment, viewportInitialized, containerRef, fitToContent, loadViewportState, setViewport, setViewportInitialized]);

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
    const {
      localCables,
      pendingFiberPaths,
      deletedFiberPathIds,
      localRackModules,
    } = useEditorStore.getState();

    // P9: full payload — equipment.kind drives placement type, rackModules carry
    // 랙 슬롯 정보, cables source/target are polymorphic. tempIds resolve via
    // equipmentIdMap / rackModuleIdMap in the response.
    // CM-B: scaleRatio 송신 폐기 — 캔버스 1 unit = 1 cm 통일.
    const equipIds = new Set(localEquipment.map((eq) => eq.id));
    const moduleIds = new Set(localRackModules.map((m) => m.id));

    const updateData: UpdateFloorPlanRequest = {
      canvasWidth: floorPlan.canvasWidth,
      canvasHeight: floorPlan.canvasHeight,
      gridSize,
      majorGridSize,
      equipment: localEquipment.map(eq => ({
        id: isTempId(eq.id) ? null : eq.id,
        tempId: isTempId(eq.id) ? eq.id : undefined,
        kind: eq.kind,
        name: eq.name,
        positionX: eq.positionX,
        positionY: eq.positionY,
        width: eq.width,
        height: eq.height,
        rotation: eq.rotation,
        totalU: eq.totalU ?? null,
        description: eq.description ?? null,
        manager: eq.manager ?? null,
        height3d: eq.height3d ?? null,
        properties: eq.properties ?? null,
      })),
      rackModules: localRackModules.map((m) => ({
        id: isTempId(m.id) ? null : m.id,
        tempId: isTempId(m.id) ? m.id : undefined,
        rackEquipmentId: m.rackEquipmentId,
        categoryId: m.categoryId,
        name: m.name,
        startU: m.startU,
        heightU: m.heightU,
        installDate: m.installDate,
        manager: m.manager,
        description: m.description,
        properties: m.properties,
        sortOrder: m.sortOrder,
      })),
      cables: localCables
        // Drop dangling references — endpoints must resolve to a current equipment or module.
        .filter((c) => {
          const sourceOk = c.sourceModuleId
            ? moduleIds.has(c.sourceModuleId)
            : equipIds.has(c.sourceEquipmentId);
          const targetOk = c.targetModuleId
            ? moduleIds.has(c.targetModuleId)
            : equipIds.has(c.targetEquipmentId);
          return sourceOk && targetOk;
        })
        .map((c) => ({
          id: isTempId(c.id) ? null : c.id,
          source: c.sourceModuleId
            ? { equipmentId: null, moduleId: c.sourceModuleId }
            : { equipmentId: c.sourceEquipmentId, moduleId: null },
          target: c.targetModuleId
            ? { equipmentId: null, moduleId: c.targetModuleId }
            : { equipmentId: c.targetEquipmentId, moduleId: null },
          cableType: c.cableType,
          categoryId: c.categoryId ?? null,
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

  const clearSaveError = useCallback(() => setSaveError(null), []);

  return {
    floor,
    floorPlan,
    floorLoading,
    planLoading,
    planError,
    saveError,
    clearSaveError,
    saveMutation,
    handleSave,
  };
}
