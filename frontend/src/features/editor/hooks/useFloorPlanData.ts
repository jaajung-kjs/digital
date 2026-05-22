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
import type { DistributionCircuit } from '../../../types/distributionCircuit';
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
 * backend 는 폴리모픽 source/target (equipmentId | moduleId | circuitId) 를 준다.
 * LocalCable 은 그 셋을 *EquipmentId 한 필드로 평탄화해 담는다 (= endpoint id,
 * 종류는 *ModuleId / *CircuitId 로 판별). 원본 moduleId / circuitId 도 그대로 보존.
 */
function planCablesToLocalCables(cables: FloorPlanCable[]): LocalCable[] {
  return cables.map((c) => ({
    id: c.id,
    sourceEquipmentId: c.sourceEquipmentId ?? c.sourceModuleId ?? c.sourceCircuitId ?? '',
    targetEquipmentId: c.targetEquipmentId ?? c.targetModuleId ?? c.targetCircuitId ?? '',
    sourceModuleId: c.sourceModuleId ?? null,
    targetModuleId: c.targetModuleId ?? null,
    sourceCircuitId: c.sourceCircuitId ?? null,
    targetCircuitId: c.targetCircuitId ?? null,
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
    fiberPathLabel: c.fiberPathLabel ?? null,
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
    stagedBackgroundDrawing, stagedBackgroundOpacity,
  } = useEditorStore();
  const { fitToContent, loadViewportState, saveViewportState, clearViewportState } = useViewport(floorId);

  // Track the previous backgroundDrawing **identity** across renders. We use
  // `source.importedAt` (or `null` when absent) instead of the object
  // reference itself: every floorPlan refetch creates a brand-new object,
  // including when only `backgroundOpacity` changed — that would falsely
  // trigger "DWG replaced" and re-fit, jumping the viewport while the user
  // drags the opacity slider. importedAt is stamped once at import and
  // stable across refetches. `undefined` = never initialized (first run).
  const prevBgIdRef = useRef<string | null | undefined>(undefined);

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
      const distCircuitIdMap = response.data?.data?.distCircuitIdMap ?? {};
      const { pendingUploads, pendingLogs } = useEditorStore.getState();
      const tempIdMap = buildTempIdMap(equipmentIdMap);
      const moduleIdMap = buildTempIdMap(rackModuleIdMap);
      const circuitIdMap = buildTempIdMap(distCircuitIdMap);
      const resolveId = (id: string) => tempIdMap.get(id) ?? id;
      const resolveModuleId = (id: string) => moduleIdMap.get(id) ?? id;
      const resolveCircuitId = (id: string) => circuitIdMap.get(id) ?? id;

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
      const {
        localCables: cablesAfterSave,
        localRackModules: modulesAfterSave,
        localDistributionCircuits: circuitsAfterSave,
      } = useEditorStore.getState();
      useEditorStore.getState().setCables(cablesAfterSave.map((c) => ({
        ...c,
        sourceEquipmentId: resolveId(c.sourceEquipmentId),
        targetEquipmentId: resolveId(c.targetEquipmentId),
        sourceModuleId: c.sourceModuleId ? resolveModuleId(c.sourceModuleId) : null,
        targetModuleId: c.targetModuleId ? resolveModuleId(c.targetModuleId) : null,
        sourceCircuitId: c.sourceCircuitId ? resolveCircuitId(c.sourceCircuitId) : null,
        targetCircuitId: c.targetCircuitId ? resolveCircuitId(c.targetCircuitId) : null,
      })));
      useEditorStore.getState().setRackModules(modulesAfterSave.map((m) => ({
        ...m,
        id: resolveModuleId(m.id),
        rackEquipmentId: resolveId(m.rackEquipmentId),
      })));
      useEditorStore.getState().setDistributionCircuits(circuitsAfterSave.map((c) => ({
        ...c,
        id: resolveCircuitId(c.id),
        distributionEquipmentId: resolveId(c.distributionEquipmentId),
      })));

      // Optimistically push the staged background into the floorPlan cache
      // BEFORE clearPendingData wipes the staged values. Without this, the
      // canvas would briefly fall back to the pre-save floorPlan in the gap
      // between clearPendingData and the refetch landing.
      const stagedBgNow = useEditorStore.getState().stagedBackgroundDrawing;
      const stagedOpacityNow = useEditorStore.getState().stagedBackgroundOpacity;
      if (stagedBgNow !== undefined || stagedOpacityNow !== undefined) {
        queryClient.setQueryData<FloorPlanDetail | undefined>(
          ['floorPlan', floorId],
          (old) => {
            if (!old) return old;
            return {
              ...old,
              ...(stagedBgNow !== undefined ? { backgroundDrawing: stagedBgNow } : {}),
              ...(stagedOpacityNow !== undefined ? { backgroundOpacity: stagedOpacityNow } : {}),
            };
          },
        );
      }

      // Clear pending data and invalidate queries
      useEditorStore.getState().clearPendingData();

      // Delete localStorage draft on successful save
      if (floorId) {
        localStorage.removeItem(`draft-plan-${floorId}`);
      }

      queryClient.invalidateQueries({ queryKey: ['floorPlan', floorId] });
      queryClient.invalidateQueries({ queryKey: ['fiber-paths'] });
      queryClient.invalidateQueries({ queryKey: RACK_MODULE_KEYS.all });
      // 도면 저장 시 모듈 카운트가 바뀌므로 노드 통계 캐시도 무효화.
      queryClient.invalidateQueries({ queryKey: ['stats', 'rack-modules'] });
      if (pendingUploads.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['equipment-photos'] });
      }
      if (pendingLogs.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['maintenance-logs'] });
      }
      setHasChanges(false);
      useEditorStore.getState().setRestoredFromVersion(null);

      // Reset undo/redo history after successful save
      useEditorStore.temporal.getState().clear();
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

  // DISTRIBUTION 설비 id 들을 join-key 로 묶어 회로 목록을 aggregate fetch.
  const distEquipmentIds = (floorPlan?.equipment ?? [])
    .filter((eq) => eq.kind === 'DISTRIBUTION')
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

  const { data: aggregateDistCircuits } = useQuery({
    queryKey: ['floorPlan-dist-circuits', floorId, distEquipmentIds],
    queryFn: async () => {
      const ids = distEquipmentIds.split('|').filter(Boolean);
      if (ids.length === 0) return [] as DistributionCircuit[];
      const results = await Promise.all(
        ids.map((id) =>
          api
            .get<{ data: DistributionCircuit[] }>('/distribution-circuits', {
              params: { distributionId: id },
            })
            .then((r) => r.data.data)
            .catch(() => [] as DistributionCircuit[]),
        ),
      );
      return results.flat();
    },
    enabled: !!floorPlan && distEquipmentIds.length > 0,
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
    setViewportInitialized(false);
  }, [floorPlan, floorId, setLocalEquipment, setGridSize, setMajorGridSize, setHasChanges, setViewportInitialized]);

  // P9: seed `localRackModules` once the aggregate fetch lands. The hook above
  // re-runs whenever the rack equipment id set changes, so the working copy
  // stays in sync with the server snapshot until the user edits modules.
  useEffect(() => {
    if (!aggregateRackModules) return;
    useEditorStore.getState().setRackModules(aggregateRackModules);
  }, [aggregateRackModules]);

  useEffect(() => {
    if (!aggregateDistCircuits) return;
    useEditorStore.getState().setDistributionCircuits(aggregateDistCircuits);
  }, [aggregateDistCircuits]);

  // undo/redo baseline — 비동기 3쿼리(설비+케이블 / 랙모듈 / 회로)가 모두 store 에
  // 반영된 뒤 temporal history 를 비운다. 초기 로드 중간 상태가 첫 undo 의 대상이
  // 되어 랙 모듈이 사라지던 버그를 막는다. 저장 후 refetch 도 같은 effect 가 정리.
  useEffect(() => {
    if (!floorPlan) return;
    const racksReady = rackEquipmentIds.length === 0 || aggregateRackModules !== undefined;
    const distReady = distEquipmentIds.length === 0 || aggregateDistCircuits !== undefined;
    if (!racksReady || !distReady) return;
    useEditorStore.temporal.getState().clear();
  }, [floorPlan, aggregateRackModules, aggregateDistCircuits, rackEquipmentIds, distEquipmentIds]);

  // Viewport initialization. Container layout is async — on first mount the
  // ref is set but clientWidth/Height can still be 0 for a frame. Without a
  // dependency on container size the effect would never re-fire after layout
  // settled, leaving the canvas at the store's (0,0,100) default and giving
  // the user a "stuck at top-left" feeling. RAF-poll until the box is
  // measurable, then fit/restore.
  useEffect(() => {
    if (!floorPlan || !containerRef.current || viewportInitialized) return;
    if (floorPlan.equipment.length > 0 && localEquipment.length === 0) return;

    let cancelled = false;
    const tryInit = () => {
      if (cancelled) return;
      const container = containerRef.current;
      if (!container) return;
      if (container.clientWidth === 0 || container.clientHeight === 0) {
        requestAnimationFrame(tryInit);
        return;
      }
      // Effective background = staged value (if user staged one this session)
      // ?? server. Staging produces a fresh `source.importedAt` from the
      // parser, so the identity check below detects staged uploads too.
      const effectiveBg =
        stagedBackgroundDrawing !== undefined
          ? stagedBackgroundDrawing
          : floorPlan.backgroundDrawing ?? null;
      const newBgId = effectiveBg?.source?.importedAt ?? null;
      const isFirstRun = prevBgIdRef.current === undefined;
      const bgChangedAfterInit = !isFirstRun && newBgId !== prevBgIdRef.current;

      // Same-floor refetch with the same DWG (opacity slider, post-save sync,
      // etc.) — the viewport store already has whatever zoom/pan the user is
      // currently looking at. Restoring from localStorage here would snap
      // back to a one-step-old value and make the viewport flicker. Skip.
      if (!isFirstRun && !bgChangedAfterInit) {
        setViewportInitialized(true);
        return;
      }

      if (bgChangedAfterInit) clearViewportState();

      const savedViewport = bgChangedAfterInit ? null : loadViewportState();
      if (savedViewport && savedViewport.zoom > 0) {
        setViewport(savedViewport.zoom, savedViewport.panX ?? 0, savedViewport.panY ?? 0);
      } else {
        fitToContent(
          localEquipment,
          effectiveBg,
          { width: floorPlan.canvasWidth, height: floorPlan.canvasHeight },
          container.clientWidth,
          container.clientHeight,
        );
      }
      prevBgIdRef.current = newBgId;
      setViewportInitialized(true);
    };
    tryInit();
    return () => { cancelled = true; };
  }, [floorPlan, localEquipment, viewportInitialized, containerRef, fitToContent, loadViewportState, clearViewportState, setViewport, setViewportInitialized, stagedBackgroundDrawing]);

  // Save viewport on unmount + beforeunload. Skip the save when the viewport
  // never finished initializing — otherwise we'd persist the store's default
  // (zoom=100, pan=0,0) over a perfectly good cached entry on fast unmount.
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (useEditorStore.getState().viewportInitialized) {
        saveViewportState(zoom, panX, panY);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      if (useEditorStore.getState().viewportInitialized) {
        saveViewportState(zoom, panX, panY);
      }
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
      localDistributionCircuits,
    } = useEditorStore.getState();

    // P9: full payload — equipment.kind drives placement type, rackModules carry
    // 랙 슬롯 정보, cables source/target are polymorphic. tempIds resolve via
    // equipmentIdMap / rackModuleIdMap in the response.
    // CM-B: scaleRatio 송신 폐기 — 캔버스 1 unit = 1 cm 통일.
    const equipIds = new Set(localEquipment.map((eq) => eq.id));
    const moduleIds = new Set(localRackModules.map((m) => m.id));
    const circuitIds = new Set(localDistributionCircuits.map((c) => c.id));

    const updateData: UpdateFloorPlanRequest = {
      canvasWidth: floorPlan.canvasWidth,
      canvasHeight: floorPlan.canvasHeight,
      gridSize,
      majorGridSize,
      // Include staged background only when user changed it. The 3-state
      // (undefined / null / object) round-trips through JSON cleanly because
      // we omit the key entirely when undefined.
      ...(stagedBackgroundDrawing !== undefined ? { backgroundDrawing: stagedBackgroundDrawing } : {}),
      ...(stagedBackgroundOpacity !== undefined ? { backgroundOpacity: stagedBackgroundOpacity } : {}),
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
        installDate: eq.installDate ?? null,
        height3d: eq.height3d ?? null,
        properties: eq.properties ?? null,
      })),
      rackModules: localRackModules.map((m) => ({
        id: isTempId(m.id) ? null : m.id,
        tempId: isTempId(m.id) ? m.id : undefined,
        rackEquipmentId: m.rackEquipmentId,
        categoryId: m.categoryId,
        name: m.name,
        slotIndex: m.slotIndex,
        slotSpan: m.slotSpan,
        installDate: m.installDate,
        manager: m.manager,
        description: m.description,
        properties: m.properties as Record<string, unknown> | null,
        sortOrder: m.sortOrder,
      })),
      distributionCircuits: localDistributionCircuits.map((c) => ({
        id: isTempId(c.id) ? null : c.id,
        tempId: isTempId(c.id) ? c.id : undefined,
        distributionEquipmentId: c.distributionEquipmentId,
        feederName: c.feederName,
        branchName: c.branchName,
        description: c.description,
        sortOrder: c.sortOrder,
      })),
      cables: localCables
        // Drop dangling references — endpoint 는 현재 equipment / module / circuit
        // 중 하나로 resolve 돼야 한다.
        .filter((c) => {
          const sourceOk = c.sourceCircuitId
            ? circuitIds.has(c.sourceCircuitId)
            : c.sourceModuleId
              ? moduleIds.has(c.sourceModuleId)
              : equipIds.has(c.sourceEquipmentId);
          const targetOk = c.targetCircuitId
            ? circuitIds.has(c.targetCircuitId)
            : c.targetModuleId
              ? moduleIds.has(c.targetModuleId)
              : equipIds.has(c.targetEquipmentId);
          return sourceOk && targetOk;
        })
        .map((c) => ({
          id: isTempId(c.id) ? null : c.id,
          source: c.sourceCircuitId
            ? { equipmentId: null, moduleId: null, circuitId: c.sourceCircuitId }
            : c.sourceModuleId
              ? { equipmentId: null, moduleId: c.sourceModuleId, circuitId: null }
              : { equipmentId: c.sourceEquipmentId, moduleId: null, circuitId: null },
          target: c.targetCircuitId
            ? { equipmentId: null, moduleId: null, circuitId: c.targetCircuitId }
            : c.targetModuleId
              ? { equipmentId: null, moduleId: c.targetModuleId, circuitId: null }
              : { equipmentId: c.targetEquipmentId, moduleId: null, circuitId: null },
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
        description: fp.description ?? undefined,
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
