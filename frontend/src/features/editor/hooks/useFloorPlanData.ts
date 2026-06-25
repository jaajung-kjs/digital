import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import type {
  FloorPlanDetail,
} from '../../../types/floorPlan';
import type { FloorDetail } from '../../../types/substation';
import type { Asset } from '../../../types/asset';
import { useEditorStore } from '../stores/editorStore';
import { useViewport } from './useViewport';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { useWorkingCopyLoader, useWorkingCopyLoaded, useEffectiveFloors } from '../../workingCopy/hooks';
import { isTempId } from '../../../utils/idHelpers';

// 새(staged, temp) 층의 기본 캔버스 설정 — Prisma Floor 스키마 @default 와 동일.
// git-like SSOT: 미커밋 층도 워킹카피 안에서 곧장 편집 가능해야 한다. 서버에 행이 없으므로
// 이 기본값으로 floorPlan 을 합성한다(설비/케이블은 effective 가 제공, 커밋 시 floorId temp→real).
const DEFAULT_CANVAS = {
  canvasWidth: 2000, canvasHeight: 1500, gridSize: 10, majorGridSize: 60,
  backgroundColor: '#ffffff', backgroundOpacity: 0.3,
} as const;

// SSOT-2d Task 2 — planCablesToLocalCables 제거. 케이블은 더 이상 plan 응답에서
// editorStore 로 평탄화하지 않는다 (통합 working copy 가 effective 케이블 제공, Task 3).

/**
 * Hook for loading floor plan data.
 *
 * USP Task 2 — 저장(handleSave/saveMutation)은 useCommitWorkingCopy 로 이관됐다.
 * 이 훅은 이제 로드(floor + floorPlan)와 floor-level 캔버스 설정의 editorStore
 * 동기화(activeFloorId/baseFloorVersion 포함) + 뷰포트 초기화만 담당한다.
 */
export function useFloorPlanData(floorId: string | undefined, containerRef: React.RefObject<HTMLDivElement | null>) {
  const {
    zoom, panX, panY,
    setGridSize, setMajorGridSize,
    setViewportInitialized,
    setViewport, viewportInitialized,
    stagedBackgroundDrawing,
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

  const isTemp = !!floorId && isTempId(floorId);

  const { data: serverFloor, isLoading: floorLoading } = useQuery({
    queryKey: ['floor', floorId],
    queryFn: async () => {
      const response = await api.get<{ data: FloorDetail }>(`/floors/${floorId}`);
      return response.data.data;
    },
    enabled: !!floorId && !isTemp,
  });

  // staged(temp) 층: 서버 행이 없으니 WC 의 org 층 + 기본 캔버스 설정으로 floor/floorPlan 을 합성.
  // 식별 필드(primitive)에만 의존해 메모이즈 — 설비 배치 등 다른 WC 변경에 객체가 재생성돼
  // 캔버스 effect 가 재실행(뷰포트 리셋)되지 않게 한다.
  const wcFloors = useEffectiveFloors();
  const wcFloor = isTemp ? wcFloors.find((x) => x.id === floorId) : undefined;
  const floor: FloorDetail | undefined = useMemo(() => {
    if (!isTemp) return serverFloor;
    if (!wcFloor) return undefined;
    return { id: wcFloor.id, substationId: wcFloor.substationId, name: wcFloor.name, floorNumber: wcFloor.floorNumber,
      description: null, sortOrder: wcFloor.sortOrder, createdAt: '', updatedAt: wcFloor.updatedAt ?? '' };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTemp, serverFloor, wcFloor?.id, wcFloor?.name, wcFloor?.substationId, wcFloor?.floorNumber, wcFloor?.sortOrder, wcFloor?.updatedAt]);

  // SSOT-2d Task 2 — 층의 변전소 단위 통합 working copy 로드. 변전소 워크스페이스에선
  // 이미 로드돼 있어(idempotent guard) no-op, 단독 `/floors/:id/plan` 경로에선 여기서
  // 트리거된다. 이후 effective 훅(Task 3)이 이 스토어를 읽는다.
  useWorkingCopyLoader(floor?.substationId ?? null);

  // 초기 fit 게이트: 통합 working copy 가 이 변전소에 대해 로드 완료됐는지. 로드 전엔
  // effectiveEquipment(floorId) 가 빈 배열이라 fit 이 0,0 으로 떨어진다 → 로드될
  // 때까지 viewportInitialized 를 세우지 않고 effect 를 다시 돌려 실제 설비에 맞춘다.
  const wcLoaded = useWorkingCopyLoaded(floor?.substationId ?? null);

  const { data: serverPlan, isLoading: planLoading, error: planError } = useQuery({
    queryKey: ['floorPlan', floorId],
    queryFn: async () => {
      const response = await api.get<{ data: FloorPlanDetail }>(`/floors/${floorId}/plan`);
      return response.data.data;
    },
    enabled: !!floorId && !isTemp,
    retry: false,
  });

  // temp 층은 기본값으로 합성 — 설비/케이블은 effective 가 제공하므로 빈 배열, version 0.
  const floorPlan: FloorPlanDetail | undefined = useMemo(() => {
    if (!isTemp) return serverPlan;
    return floor
      ? { id: floor.id, name: floor.name, ...DEFAULT_CANVAS, backgroundDrawing: null,
          equipment: [], cables: [], version: 0, updatedAt: '' }
      : undefined;
  }, [isTemp, serverPlan, floor]);

  // USP Task 2 — 저장(commitSubstation + 사진/로그 flush + 재조정)은
  // useCommitWorkingCopy 로 이관됐다. 여기 있던 saveMutation/handleSave + 헬퍼는 제거됨.

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

    // 새(temp) 층은 캔버스설정 OCC 대상이 아니다(org floor create 가 기본값으로 생성) →
    // baseFloorVersion 을 null 로 둬 commit 의 floor 섹션(OCC update)을 만들지 않는다.
    useEditorStore.getState().setBaseFloorVersion(
      isTemp ? null
        : typeof floorPlan.updatedAt === 'string' ? floorPlan.updatedAt : new Date(floorPlan.updatedAt).toISOString(),
    );
    // USP Task 1 — self-contained 커밋(useCommitWorkingCopy)이 floor 섹션 id 로 쓸
    // 현재 floorId 를 store 에 동기화한다(baseFloorVersion 과 한 쌍).
    if (floorId) useEditorStore.getState().setActiveFloorId(floorId);
    setGridSize(floorPlan.gridSize);
    setMajorGridSize(floorPlan.majorGridSize ?? 60);
    // CM-B: scaleRatio 더 이상 동기화하지 않음 — 캔버스 1 unit = 1 cm 통일.

    useEditorStore.getState().clearPendingData();
    setViewportInitialized(false);
  }, [floorPlan, floorId, isTemp, setGridSize, setMajorGridSize, setViewportInitialized]);

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
    // GET /plan 의 saved 설비(floorPlan.equipment)가 있으면 WC 로드를 기다리지 않고 즉시 그 좌표로
    // fit 한다 — 트리 콜드 진입 0,0 버그 해소. (WC load 는 비동기라 경쟁에서 지면 이 게이트가
    // viewport 를 스토어 기본값 0,0 에 남겼다. 현황 진입은 WC 가 이미 로드돼 안 걸렸던 것.)
    // 빈 평면도(폴백 설비도 없음)일 때만 WC 로드를 기다려 staged 신규 설비에 맞춘다.
    if (!wcLoaded && !floorPlan.equipment?.length) return;

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

      // 진입 시 항상 설비 bounds 에 맞춰 fit — stale localStorage 복원으로 0,0 에
      // 떨어지지 않게 한다(사용자 요구: 첫 진입에 모든 설비 한눈에).
      // bounds 는 통합 working copy 의 EFFECTIVE 설비(미저장 staged 배치 포함).
      // 로드 직후 effective 가 비면 GET /plan 응답의 saved equipment 로 폴백.
      const effectiveEquipment = floorId
        ? useSubstationWorkingCopy.getState().effectiveEquipment(floorId)
        : [];
      // 폴백(GET /plan 의 saved equipment)은 최소 배치 모양이라 fit 가
      // 읽는 배치 필드(positionX/Y/width2d/height2d)만 Asset 투영으로 흡수한다.
      const fitEquipment: Asset[] =
        effectiveEquipment.length > 0
          ? effectiveEquipment
          : floorPlan.equipment.map((e) => ({
              positionX: e.positionX,
              positionY: e.positionY,
              width2d: e.width,
              height2d: e.height,
            } as Asset));
      fitToContent(
        fitEquipment,
        effectiveBg,
        { width: floorPlan.canvasWidth, height: floorPlan.canvasHeight },
        container.clientWidth,
        container.clientHeight,
      );
      prevBgIdRef.current = newBgId;
      setViewportInitialized(true);
    };
    tryInit();
    return () => { cancelled = true; };
  }, [floorPlan, viewportInitialized, wcLoaded, containerRef, fitToContent, loadViewportState, clearViewportState, setViewport, setViewportInitialized, stagedBackgroundDrawing]);

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

  return {
    floor,
    floorPlan,
    floorLoading,
    planLoading,
    planError,
  };
}
