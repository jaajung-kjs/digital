import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

// ── Cable drawing ────────────────────────────────────────────────────────────

export type CableDrawingPhase =
  | 'selectingSource'        // 출발 설비 클릭 대기
  | 'pickingSourceModule'    // 랙/OFD 가 출발이면 모듈/포트 picker 가 열려 있음
  | 'drawingPath'            // 출발 확정, 경유점 그리는 중
  | 'pickingTargetModule'    // 도착이 랙/OFD → 모듈/포트 picker
  | 'selectingSpec';         // 양 끝 확정 → CableSpecModal 열림

export interface CableDrawingData {
  phase: CableDrawingPhase;

  /** Source CONTAINER — 도면에 배치된 설비/랙/분전반/OFD 의 asset id.
   *  어떤 picker 가 열릴지를 결정한다 (랙→모듈, 분전반→회로, OFD→포트). */
  sourceContainerAssetId: string | null;
  /** Source INNER pick — 랙 모듈 asset 또는 분전반 분기 asset 의 id.
   *  (모듈/회로는 상호배타 → 단일 필드로 병합). null 이면 컨테이너 자체가 endpoint. */
  sourceInnerAssetId: string | null;
  sourcePosition: { x: number; y: number } | null;
  sourceFiberPathId: string | null;
  sourcePortNumber: number | null;

  waypoints: [number, number][];

  targetContainerAssetId: string | null;
  targetInnerAssetId: string | null;
  targetPosition: { x: number; y: number } | null;
  targetFiberPathId: string | null;
  targetPortNumber: number | null;

  /** Cursor 미리보기 점 (drawingPath 단계) */
  previewPoint: { x: number; y: number } | null;
  hoveredAssetId: string | null;
}

const cableInitial: CableDrawingData = {
  phase: 'selectingSource',
  sourceContainerAssetId: null,
  sourceInnerAssetId: null,
  sourcePosition: null,
  sourceFiberPathId: null,
  sourcePortNumber: null,
  waypoints: [],
  targetContainerAssetId: null,
  targetInnerAssetId: null,
  targetPosition: null,
  targetFiberPathId: null,
  targetPortNumber: null,
  previewPoint: null,
  hoveredAssetId: null,
};

// ── Discriminated union ──────────────────────────────────────────────────────

export type InteractionMode =
  | { kind: 'idle' }
  | { kind: 'cableDrawing'; data: CableDrawingData };

// ── Store ────────────────────────────────────────────────────────────────────

interface InteractionActions {
  /** Cable drawing 시작 — 도구모음에서 케이블 선택 시 호출 */
  cableActivate: () => void;
  cableSetPendingSource: (containerAssetId: string, position: { x: number; y: number }) => void;
  cableSetSource: (
    containerAssetId: string,
    position: { x: number; y: number },
    extras?: { innerAssetId?: string | null; fiberPathId?: string | null; portNumber?: number | null },
  ) => void;
  cableSetPendingTarget: (containerAssetId: string, position: { x: number; y: number }) => void;
  cableSetTarget: (
    containerAssetId: string,
    position: { x: number; y: number },
    extras?: { innerAssetId?: string | null; fiberPathId?: string | null; portNumber?: number | null },
  ) => void;
  cableAddWaypoint: (x: number, y: number) => void;
  cableRemoveLastWaypoint: () => void;
  cableSetPreviewPoint: (point: { x: number; y: number } | null) => void;
  cableSetHovered: (id: string | null) => void;

  /** 어느 mode 든 강제 종료 → idle */
  cancel: () => void;
}

interface InteractionStore extends InteractionActions {
  mode: InteractionMode;
}

export const useInteractionStore = create<InteractionStore>((set) => ({
  mode: { kind: 'idle' },

  // ── Cable drawing actions ────────────────────────────────────────────────
  cableActivate: () =>
    set({ mode: { kind: 'cableDrawing', data: { ...cableInitial } } }),

  cableSetPendingSource: (containerAssetId, position) =>
    set((state) => {
      if (state.mode.kind !== 'cableDrawing') return state;
      return {
        mode: {
          kind: 'cableDrawing',
          data: {
            ...state.mode.data,
            phase: 'pickingSourceModule',
            sourceContainerAssetId: containerAssetId,
            sourceInnerAssetId: null,
            sourceFiberPathId: null,
            sourcePortNumber: null,
            sourcePosition: position,
          },
        },
      };
    }),

  cableSetSource: (containerAssetId, position, extras) =>
    set((state) => {
      // Idle 상태에서도 source 가 들어올 수 있음 (예: ConnectionDiagram 카드 클릭).
      // 그 경우 cable drawing 을 새로 시작하는 의미.
      const prev = state.mode.kind === 'cableDrawing' ? state.mode.data : cableInitial;
      return {
        mode: {
          kind: 'cableDrawing',
          data: {
            ...prev,
            phase: 'drawingPath',
            sourceContainerAssetId: containerAssetId,
            sourceInnerAssetId: extras?.innerAssetId ?? null,
            sourceFiberPathId: extras?.fiberPathId ?? null,
            sourcePortNumber: extras?.portNumber ?? null,
            sourcePosition: position,
            waypoints: [],
            targetContainerAssetId: null,
            targetInnerAssetId: null,
            targetFiberPathId: null,
            targetPortNumber: null,
            targetPosition: null,
            previewPoint: null,
            hoveredAssetId: null,
          },
        },
      };
    }),

  cableSetPendingTarget: (containerAssetId, position) =>
    set((state) => {
      if (state.mode.kind !== 'cableDrawing') return state;
      return {
        mode: {
          kind: 'cableDrawing',
          data: {
            ...state.mode.data,
            phase: 'pickingTargetModule',
            targetContainerAssetId: containerAssetId,
            targetInnerAssetId: null,
            targetFiberPathId: null,
            targetPortNumber: null,
            targetPosition: position,
          },
        },
      };
    }),

  cableSetTarget: (containerAssetId, position, extras) =>
    set((state) => {
      if (state.mode.kind !== 'cableDrawing') return state;
      return {
        mode: {
          kind: 'cableDrawing',
          data: {
            ...state.mode.data,
            phase: 'selectingSpec',
            targetContainerAssetId: containerAssetId,
            targetInnerAssetId: extras?.innerAssetId ?? null,
            targetFiberPathId: extras?.fiberPathId ?? null,
            targetPortNumber: extras?.portNumber ?? null,
            targetPosition: position,
            previewPoint: null,
            hoveredAssetId: null,
          },
        },
      };
    }),

  cableAddWaypoint: (x, y) =>
    set((state) => {
      if (state.mode.kind !== 'cableDrawing') return state;
      return {
        mode: {
          kind: 'cableDrawing',
          data: {
            ...state.mode.data,
            waypoints: [...state.mode.data.waypoints, [x, y] as [number, number]],
          },
        },
      };
    }),

  cableRemoveLastWaypoint: () =>
    set((state) => {
      if (state.mode.kind !== 'cableDrawing') return state;
      return {
        mode: {
          kind: 'cableDrawing',
          data: {
            ...state.mode.data,
            waypoints: state.mode.data.waypoints.slice(0, -1),
          },
        },
      };
    }),

  cableSetPreviewPoint: (point) =>
    set((state) => {
      if (state.mode.kind !== 'cableDrawing') return state;
      const prev = state.mode.data.previewPoint;
      if (prev?.x === point?.x && prev?.y === point?.y) return state;
      return {
        mode: { kind: 'cableDrawing', data: { ...state.mode.data, previewPoint: point } },
      };
    }),

  cableSetHovered: (id) =>
    set((state) => {
      if (state.mode.kind !== 'cableDrawing') return state;
      if (state.mode.data.hoveredAssetId === id) return state;
      return {
        mode: { kind: 'cableDrawing', data: { ...state.mode.data, hoveredAssetId: id } },
      };
    }),

  cancel: () =>
    set((state) => (state.mode.kind === 'idle' ? state : { mode: { kind: 'idle' } })),
}));

// ── Selector hooks ───────────────────────────────────────────────────────────
// shallow equality: data 안 필드가 실제로 바뀌었을 때만 재렌더. 마우스 hover /
// previewPoint 같은 빈번한 액션이 무관한 consumer 를 깨우지 않게.

export function useCableDrawing(): CableDrawingData | null {
  return useInteractionStore(
    useShallow((s) => (s.mode.kind === 'cableDrawing' ? s.mode.data : null)),
  );
}

// ── Imperative getters (event handlers / actions) ────────────────────────────

export function getCableDrawing(): CableDrawingData | null {
  const m = useInteractionStore.getState().mode;
  return m.kind === 'cableDrawing' ? m.data : null;
}
