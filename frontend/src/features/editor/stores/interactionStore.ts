import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { EndpointRef } from '../cableEndpoint';

// ── Cable drawing ────────────────────────────────────────────────────────────

/** CableSpecModal 이 종류 선택 후 store 에 싣는 카테고리 요약. */
export interface SelectedCableCategory {
  id: string;
  code: string;
  name: string;
  displayColor: string | null;
}

export type CableDrawingPhase =
  | 'selectingType'          // 케이블 종류(카테고리) 선택 대기 (CableSpecModal)
  | 'selectingSource'        // 출발 설비 클릭 대기
  | 'pickingSourceEndpoint'  // 랙/분전반/OFD 가 출발이면 모듈/회로/슬롯 picker 가 열려 있음
  | 'drawingPath'            // 출발 확정, 경유점 그리는 중
  | 'pickingTargetEndpoint'  // 도착이 랙/분전반/OFD → 모듈/회로/슬롯 picker
  | 'ready';                 // 양 끝 확정 → commitCable 가능

export interface CableDrawingData {
  phase: CableDrawingPhase;

  /** 선택된 케이블 종류. selectingType 이후 채워진다. */
  category: SelectedCableCategory | null;

  /** 출발 endpoint (containerAssetId + 선택적 inner/slot/core/role/number). */
  source: EndpointRef | null;
  /** 도착 endpoint. */
  target: EndpointRef | null;

  waypoints: [number, number][];

  /** Cursor 미리보기 점 (drawingPath 단계) */
  previewPoint: { x: number; y: number } | null;
  hoveredAssetId: string | null;
}

const cableInitial: CableDrawingData = {
  phase: 'selectingType',
  category: null,
  source: null,
  target: null,
  waypoints: [],
  previewPoint: null,
  hoveredAssetId: null,
};

// ── Discriminated union ──────────────────────────────────────────────────────

export type InteractionMode =
  | { kind: 'idle' }
  | { kind: 'cableDrawing'; data: CableDrawingData };

// ── Store ────────────────────────────────────────────────────────────────────

interface InteractionActions {
  /** Cable drawing 시작 — 도구모음에서 케이블 선택 시 호출.
   *  source/category 가 주입되면 그에 맞춰 초기 phase 를 결정한다. */
  cableActivate: (opts?: { source?: EndpointRef; category?: SelectedCableCategory }) => void;
  /** selectingType 에서 종류 확정 → 출발 선택(또는 source 주입돼 있으면 경로). */
  cableSetType: (category: SelectedCableCategory) => void;
  cableSetPendingSource: () => void;
  cableSetSource: (ref: EndpointRef) => void;
  cableSetPendingTarget: () => void;
  cableSetTarget: (ref: EndpointRef) => void;
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
  cableActivate: (opts) =>
    set(() => {
      const category = opts?.category ?? null;
      const source = opts?.source ?? null;
      const phase: CableDrawingPhase = category
        ? source
          ? 'drawingPath'
          : 'selectingSource'
        : 'selectingType';
      return {
        mode: {
          kind: 'cableDrawing',
          data: { ...cableInitial, category, source, phase },
        },
      };
    }),

  cableSetType: (category) =>
    set((state) => {
      if (state.mode.kind !== 'cableDrawing') return state;
      if (state.mode.data.phase !== 'selectingType') return state;
      const source = state.mode.data.source;
      return {
        mode: {
          kind: 'cableDrawing',
          data: {
            ...state.mode.data,
            category,
            phase: source ? 'drawingPath' : 'selectingSource',
          },
        },
      };
    }),

  cableSetPendingSource: () =>
    set((state) => {
      if (state.mode.kind !== 'cableDrawing') return state;
      if (state.mode.data.phase !== 'selectingSource') return state;
      return {
        mode: {
          kind: 'cableDrawing',
          data: {
            ...state.mode.data,
            phase: 'pickingSourceEndpoint',
          },
        },
      };
    }),

  cableSetSource: (ref) =>
    set((state) => {
      // Idle 상태에서도 source 가 들어올 수 있음 (예: ConnectionDiagram 카드 클릭).
      const prev = state.mode.kind === 'cableDrawing' ? state.mode.data : cableInitial;
      return {
        mode: {
          kind: 'cableDrawing',
          data: {
            ...prev,
            phase: 'drawingPath',
            source: ref,
            target: null,
            waypoints: [],
            previewPoint: null,
            hoveredAssetId: null,
          },
        },
      };
    }),

  cableSetPendingTarget: () =>
    set((state) => {
      if (state.mode.kind !== 'cableDrawing') return state;
      if (state.mode.data.phase !== 'drawingPath') return state;
      return {
        mode: {
          kind: 'cableDrawing',
          data: {
            ...state.mode.data,
            phase: 'pickingTargetEndpoint',
          },
        },
      };
    }),

  cableSetTarget: (ref) =>
    set((state) => {
      if (state.mode.kind !== 'cableDrawing') return state;
      return {
        mode: {
          kind: 'cableDrawing',
          data: {
            ...state.mode.data,
            phase: 'ready',
            target: ref,
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
