import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type {
  FloorPlanDetail,
} from '../../../types/floorPlan';
import type { FloorDetail } from '../../../types/substation';
import { useEditorStore } from '../stores/editorStore';
import { useToastStore } from '../stores/toastStore';
import { useViewport } from './useViewport';
import { buildIdMaps } from '../../workingCopy/idMaps';
import { commitSubstation, type FloorCommitSection, type SubstationCommitResult } from '../../workingCopy/substationCommit';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { useWorkingCopyLoader } from '../../workingCopy/hooks';

// SSOT-2d Task 2 — planCablesToLocalCables 제거. 케이블은 더 이상 plan 응답에서
// editorStore 로 평탄화하지 않는다 (통합 working copy 가 effective 케이블 제공, Task 3).

/**
 * Hook for loading/saving floor plan data.
 * This is the SINGLE save path — all mutations flow through here.
 */
export function useFloorPlanData(floorId: string | undefined, containerRef: React.RefObject<HTMLDivElement | null>) {
  const [saveError, setSaveError] = useState<string | null>(null);
  const isSavingRef = useRef(false);
  const queryClient = useQueryClient();
  const {
    zoom, panX, panY,
    gridSize, majorGridSize,
    setGridSize, setMajorGridSize,
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

  // SSOT-2d Task 2 — 층의 변전소 단위 통합 working copy 로드. 변전소 워크스페이스에선
  // 이미 로드돼 있어(idempotent guard) no-op, 단독 `/floors/:id/plan` 경로에선 여기서
  // 트리거된다. 이후 effective 훅(Task 3)이 이 스토어를 읽는다.
  useWorkingCopyLoader(floor?.substationId ?? null);

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
  //
  // SSOT-2d Task 5 — 저장이 더 이상 `PUT /floors/:id/plan`(bulkUpdatePlan)이 아니라
  // 통합 working copy 를 `POST /substations/:id/commit` 으로 커밋한다.
  // 캔버스 설정(canvasWidth/gridSize/배경 등 — 여전히 editorStore 소유)은 commit 의
  // `floor` 섹션으로 동봉돼 단일 트랜잭션에서 floor 컬럼까지 OCC 갱신된다.
  //
  // 사진/유지보수 로그는 2c 에서 즉시 반영으로 이관됐지만, 에디터가 여전히
  // pendingUploads/pendingLogs 큐를 보유하면(설비 신규 생성 시 tempId 의존) 커밋
  // 성공 후 assets idMap 으로 tempId→realId 해석해 flush 한다.
  const saveMutation = useMutation<SubstationCommitResult, unknown, { substationId: string; floor: FloorCommitSection }>({
    mutationFn: ({ substationId, floor }) => {
      const s = useSubstationWorkingCopy.getState();
      return commitSubstation(substationId, s.overlays, s.saved.assets, queryClient, floor);
    },
    onSuccess: async (result, { substationId }) => {
      useToastStore.getState().showToast('저장했습니다');
      // 통합 커밋 응답의 idMaps.assets(설비=top-level asset)로 tempId→realId 해석.
      const idMaps = buildIdMaps({ equipmentIdMap: result.idMaps?.assets });
      const { pendingUploads, pendingLogs } = useEditorStore.getState();
      const resolveEquipmentId = (id: string) => idMaps.equipment.get(id) ?? id;

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
              await api.post(`/equipment/${resolveEquipmentId(upload.equipmentId)}/photos`, formData, {
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
              await api.post(`/equipment/${resolveEquipmentId(log.equipmentId)}/maintenance-logs`, {
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

      // 재조정: 통합 store 를 새 saved 로 재로드(overlay/history 클리어 포함) →
      // tempId 가 realId 로 정착하고 dirty=0 으로 떨어진다. 이어 floorPlan 도 refetch.
      isSavingRef.current = true;
      await useSubstationWorkingCopy.getState().load(substationId);

      // editorStore 의 pending 큐/스테이징 정리.
      useEditorStore.getState().clearPendingData();

      // Delete localStorage draft on successful save
      if (floorId) {
        localStorage.removeItem(`draft-plan-${floorId}`);
      }

      // 사진/로그 invalidate 는 commit 외 (큐 패턴) — 별도 유지
      if (pendingUploads.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['equipment-photos'] });
      }
      if (pendingLogs.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['maintenance-logs'] });
      }
      setHasChanges(false);
      useEditorStore.getState().setRestoredFromVersion(null);
    },
    onError: (error: unknown) => {
      const resp = (error as { response?: { status?: number; data?: { details?: { id: string; name?: string }[] } } }).response;
      if (resp?.status === 409) {
        useEditorStore.getState().setFloorConflict(resp.data?.details ?? [{ id: floorId ?? '', name: '도면' }]);
        return;
      }
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      const message = err?.response?.data?.message || err?.message || '저장에 실패했습니다.';
      setSaveError(message);
      setTimeout(() => setSaveError(null), 5000);
    },
  });

  // SSOT-2d Task 2 — P9 의 aggregate rack-module / dist-circuit fetch 제거.
  // 랙모듈/회로는 변전소 단위 통합 working copy 가 effective 훅으로 제공한다(Task 3).

  // Load floor-level canvas settings into editorStore (from `/floors/:id/plan`).
  //
  // SSOT-2d Task 2 — 설비/케이블/랙모듈/회로는 더 이상 editorStore 에 채우지 않는다.
  // 이 데이터는 변전소 단위 통합 working copy(useWorkingCopyLoader 로 로드)가
  // effective 훅을 통해 제공한다(Task 3 에서 소비처 배선). 여기서는 floor-level
  // 캔버스 설정(gridSize/majorGridSize/배경 등 — 통합 스토어에 없는 값)만 채운다.
  // baseFloorVersion 은 Task 5(save/OCC 이관)까지 유지.
  useEffect(() => {
    if (!floorPlan) return;

    useEditorStore.getState().setBaseFloorVersion(
      typeof floorPlan.updatedAt === 'string' ? floorPlan.updatedAt : new Date(floorPlan.updatedAt).toISOString(),
    );
    // USP Task 1 — self-contained 커밋(useCommitWorkingCopy)이 floor 섹션 id 로 쓸
    // 현재 floorId 를 store 에 동기화한다(baseFloorVersion 과 한 쌍).
    if (floorId) useEditorStore.getState().setActiveFloorId(floorId);
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
  }, [floorPlan, floorId, setGridSize, setMajorGridSize, setHasChanges, setViewportInitialized]);

  // SSOT-2d Task 2 — 설비+케이블 / 랙모듈 / 회로의 editorStore 시딩 제거.
  // 이 데이터는 통합 working copy 가 effective 훅으로 제공한다(Task 3).
  // 따라서 P9 의 aggregate rack-module / dist-circuit fetch 와 그 시딩 effect 도
  // 함께 제거됐다. editorStore 의 영속·zundo history 도 제거됐으므로(2d-3b Task 2)
  // 여기서의 temporal-baseline reset 도 더 이상 필요 없다 — undo 는 통합 스토어가
  // 단독으로 관리한다.

  // Viewport initialization. Container layout is async — on first mount the
  // ref is set but clientWidth/Height can still be 0 for a frame. Without a
  // dependency on container size the effect would never re-fire after layout
  // settled, leaving the canvas at the store's (0,0,100) default and giving
  // the user a "stuck at top-left" feeling. RAF-poll until the box is
  // measurable, then fit/restore.
  useEffect(() => {
    if (!floorPlan || !containerRef.current || viewportInitialized) return;

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
        // bounds 는 통합 working copy 의 EFFECTIVE 설비(미저장 staged 배치 포함)로
        // 잡아, 방금 배치하고 아직 저장하지 않은 설비도 화면에 들어오게 한다.
        // 단, fit 이 로드 직후(working copy 로드 전)에 1회 도는 경우 effective 가
        // 비어 있을 수 있으므로, 그때는 GET /plan 응답의 saved equipment 로 폴백한다.
        const effectiveEquipment = floorId
          ? useSubstationWorkingCopy.getState().effectiveEquipment(floorId)
          : [];
        const fitEquipment =
          effectiveEquipment.length > 0 ? effectiveEquipment : floorPlan.equipment;
        fitToContent(
          fitEquipment,
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
  }, [floorPlan, viewportInitialized, containerRef, fitToContent, loadViewportState, clearViewportState, setViewport, setViewportInitialized, stagedBackgroundDrawing]);

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
    if (!floorPlan || !floorId) return;
    // 설비/케이블/랙모듈/회로/광경로는 통합 working copy 의 overlay 가 보유한다(2d-1~4).
    // 저장은 그 overlay 를 통째로 commitSubstation 으로 커밋하고, 에디터가 여전히
    // 소유한 floor-level 캔버스 설정만 `floor` 섹션으로 동봉한다.
    const substationId = floor?.substationId;
    if (!substationId) return;

    // baseVersion = 에디터가 로드한 floorPlan.updatedAt(ISO) — floor OCC 기준.
    const baseVersion = useEditorStore.getState().baseFloorVersion;

    // settings 3-state: backgroundDrawing/Opacity 는 사용자가 변경했을 때만 동봉
    // (undefined 키 생략 → 백엔드는 변경 없음으로 처리).
    const floorSection: FloorCommitSection = {
      id: floorId,
      baseVersion: baseVersion ?? null,
      settings: {
        canvasWidth: floorPlan.canvasWidth,
        canvasHeight: floorPlan.canvasHeight,
        gridSize,
        majorGridSize,
        ...(stagedBackgroundDrawing !== undefined ? { backgroundDrawing: stagedBackgroundDrawing } : {}),
        ...(stagedBackgroundOpacity !== undefined ? { backgroundOpacity: stagedBackgroundOpacity } : {}),
      },
    };

    saveMutation.mutate({ substationId, floor: floorSection });
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
