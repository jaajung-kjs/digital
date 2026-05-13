import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from './editorStore';
import { generateTempId } from '../../../utils/idHelpers';

// ── Cable drawing ────────────────────────────────────────────────────────────

export type CableDrawingPhase =
  | 'selectingSource'        // 출발 설비 클릭 대기
  | 'pickingSourceModule'    // 랙/OFD 가 출발이면 모듈/포트 picker 가 열려 있음
  | 'drawingPath'            // 출발 확정, 경유점 그리는 중
  | 'pickingTargetModule'    // 도착이 랙/OFD → 모듈/포트 picker
  | 'selectingSpec';         // 양 끝 확정 → CableSpecModal 열림

export interface CableDrawingData {
  phase: CableDrawingPhase;

  /** Source endpoint — 부모 설비 id (랙이면 모듈의 부모 랙 id, OFD 면 OFD id) */
  sourceEquipmentId: string | null;
  sourceModuleId: string | null;
  sourcePosition: { x: number; y: number } | null;
  sourceFiberPathId: string | null;
  sourcePortNumber: number | null;

  waypoints: [number, number][];

  targetEquipmentId: string | null;
  targetModuleId: string | null;
  targetPosition: { x: number; y: number } | null;
  targetFiberPathId: string | null;
  targetPortNumber: number | null;

  /** Cursor 미리보기 점 (drawingPath 단계) */
  previewPoint: { x: number; y: number } | null;
  hoveredEquipmentId: string | null;
}

const cableInitial: CableDrawingData = {
  phase: 'selectingSource',
  sourceEquipmentId: null,
  sourceModuleId: null,
  sourcePosition: null,
  sourceFiberPathId: null,
  sourcePortNumber: null,
  waypoints: [],
  targetEquipmentId: null,
  targetModuleId: null,
  targetPosition: null,
  targetFiberPathId: null,
  targetPortNumber: null,
  previewPoint: null,
  hoveredEquipmentId: null,
};

// ── OFD flow ─────────────────────────────────────────────────────────────────

export type OfdFlowPhase = 'selectingPort' | 'selectingTarget';

/**
 * - ofdAsSource: OFD 를 먼저 클릭 → 포트 선택 → 캔버스에서 도착 설비 픽업
 * - ofdAsTarget: 비-OFD 출발 선택됨 → OFD 를 도착으로 클릭 → 포트 선택 시 즉시 생성
 */
export type OfdFlowDirection = 'ofdAsSource' | 'ofdAsTarget';

export interface OfdFlowData {
  phase: OfdFlowPhase;
  direction: OfdFlowDirection;
  ofdId: string;
  /** ofdAsTarget 일 때만 set */
  sourceEquipmentId: string | null;
  fiberPathId: string | null;
  portNumber: number | null;
  hoveredEquipmentId: string | null;
}

// ── Discriminated union ──────────────────────────────────────────────────────

export type InteractionMode =
  | { kind: 'idle' }
  | { kind: 'cableDrawing'; data: CableDrawingData }
  | { kind: 'ofdFlow'; data: OfdFlowData };

// ── Store ────────────────────────────────────────────────────────────────────

interface InteractionActions {
  /** Cable drawing 시작 — 도구모음에서 케이블 선택 시 호출 */
  cableActivate: () => void;
  cableSetPendingSource: (equipmentId: string, position: { x: number; y: number }) => void;
  cableSetSource: (
    equipmentId: string,
    position: { x: number; y: number },
    extras?: { moduleId?: string | null; fiberPathId?: string | null; portNumber?: number | null },
  ) => void;
  cableSetPendingTarget: (equipmentId: string, position: { x: number; y: number }) => void;
  cableSetTarget: (
    equipmentId: string,
    position: { x: number; y: number },
    extras?: { moduleId?: string | null; fiberPathId?: string | null; portNumber?: number | null },
  ) => void;
  cableAddWaypoint: (x: number, y: number) => void;
  cableRemoveLastWaypoint: () => void;
  cableSetPreviewPoint: (point: { x: number; y: number } | null) => void;
  cableSetHovered: (id: string | null) => void;
  /** OFD flow 시작 — OFD 를 출발로 클릭한 경우 */
  ofdStartFromOfd: (ofdId: string) => void;
  /** OFD flow 시작 — 비-OFD 출발 선택 + OFD 를 도착으로 클릭한 경우 */
  ofdStartToOfd: (sourceEquipmentId: string, ofdId: string) => void;
  ofdSelectPort: (fiberPathId: string, portNumber: number) => void;
  ofdCompleteConnection: (targetEquipmentId: string) => void;
  ofdSetHovered: (id: string | null) => void;

  /** 어느 mode 든 강제 종료 → idle */
  cancel: () => void;
}

interface InteractionStore extends InteractionActions {
  mode: InteractionMode;
}

export const useInteractionStore = create<InteractionStore>((set, get) => ({
  mode: { kind: 'idle' },

  // ── Cable drawing actions ────────────────────────────────────────────────
  cableActivate: () =>
    set({ mode: { kind: 'cableDrawing', data: { ...cableInitial } } }),

  cableSetPendingSource: (equipmentId, position) =>
    set((state) => {
      if (state.mode.kind !== 'cableDrawing') return state;
      return {
        mode: {
          kind: 'cableDrawing',
          data: {
            ...state.mode.data,
            phase: 'pickingSourceModule',
            sourceEquipmentId: equipmentId,
            sourceModuleId: null,
            sourceFiberPathId: null,
            sourcePortNumber: null,
            sourcePosition: position,
          },
        },
      };
    }),

  cableSetSource: (equipmentId, position, extras) =>
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
            sourceEquipmentId: equipmentId,
            sourceModuleId: extras?.moduleId ?? null,
            sourceFiberPathId: extras?.fiberPathId ?? null,
            sourcePortNumber: extras?.portNumber ?? null,
            sourcePosition: position,
            waypoints: [],
            targetEquipmentId: null,
            targetModuleId: null,
            targetFiberPathId: null,
            targetPortNumber: null,
            targetPosition: null,
            previewPoint: null,
            hoveredEquipmentId: null,
          },
        },
      };
    }),

  cableSetPendingTarget: (equipmentId, position) =>
    set((state) => {
      if (state.mode.kind !== 'cableDrawing') return state;
      return {
        mode: {
          kind: 'cableDrawing',
          data: {
            ...state.mode.data,
            phase: 'pickingTargetModule',
            targetEquipmentId: equipmentId,
            targetModuleId: null,
            targetFiberPathId: null,
            targetPortNumber: null,
            targetPosition: position,
          },
        },
      };
    }),

  cableSetTarget: (equipmentId, position, extras) =>
    set((state) => {
      if (state.mode.kind !== 'cableDrawing') return state;
      return {
        mode: {
          kind: 'cableDrawing',
          data: {
            ...state.mode.data,
            phase: 'selectingSpec',
            targetEquipmentId: equipmentId,
            targetModuleId: extras?.moduleId ?? null,
            targetFiberPathId: extras?.fiberPathId ?? null,
            targetPortNumber: extras?.portNumber ?? null,
            targetPosition: position,
            previewPoint: null,
            hoveredEquipmentId: null,
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
      if (state.mode.data.hoveredEquipmentId === id) return state;
      return {
        mode: { kind: 'cableDrawing', data: { ...state.mode.data, hoveredEquipmentId: id } },
      };
    }),

  // ── OFD flow actions ─────────────────────────────────────────────────────
  ofdStartFromOfd: (ofdId) =>
    set({
      mode: {
        kind: 'ofdFlow',
        data: {
          phase: 'selectingPort',
          direction: 'ofdAsSource',
          ofdId,
          sourceEquipmentId: null,
          fiberPathId: null,
          portNumber: null,
          hoveredEquipmentId: null,
        },
      },
    }),

  ofdStartToOfd: (sourceEquipmentId, ofdId) =>
    set({
      mode: {
        kind: 'ofdFlow',
        data: {
          phase: 'selectingPort',
          direction: 'ofdAsTarget',
          ofdId,
          sourceEquipmentId,
          fiberPathId: null,
          portNumber: null,
          hoveredEquipmentId: null,
        },
      },
    }),

  ofdSelectPort: (fiberPathId, portNumber) => {
    const state = get();
    if (state.mode.kind !== 'ofdFlow') return;
    const { direction, sourceEquipmentId, ofdId } = state.mode.data;

    if (direction === 'ofdAsTarget' && sourceEquipmentId && ofdId) {
      // OFD 가 도착이면 포트 선택과 동시에 케이블 생성 → 흐름 종료
      useEditorStore.getState().addCable({
        id: generateTempId(),
        sourceEquipmentId,
        targetEquipmentId: ofdId,
        cableType: 'FIBER',
        fiberPathId,
        fiberPortNumber: portNumber,
      });
      set({ mode: { kind: 'idle' } });
    } else {
      // OFD 가 출발 → 포트 저장 + 캔버스에서 도착 픽업 대기
      set({
        mode: {
          kind: 'ofdFlow',
          data: { ...state.mode.data, fiberPathId, portNumber, phase: 'selectingTarget' },
        },
      });
    }
  },

  ofdCompleteConnection: (targetEquipmentId) => {
    const state = get();
    if (state.mode.kind !== 'ofdFlow') return;
    const { phase, direction, ofdId, fiberPathId, portNumber } = state.mode.data;
    if (phase !== 'selectingTarget' || direction !== 'ofdAsSource') return;
    if (!ofdId || !fiberPathId || !portNumber) return;

    useEditorStore.getState().addCable({
      id: generateTempId(),
      sourceEquipmentId: ofdId,
      targetEquipmentId,
      cableType: 'FIBER',
      fiberPathId,
      fiberPortNumber: portNumber,
    });
    set({ mode: { kind: 'idle' } });
  },

  ofdSetHovered: (id) =>
    set((state) => {
      if (state.mode.kind !== 'ofdFlow') return state;
      if (state.mode.data.hoveredEquipmentId === id) return state;
      return {
        mode: { kind: 'ofdFlow', data: { ...state.mode.data, hoveredEquipmentId: id } },
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

export function useOfdFlow(): OfdFlowData | null {
  return useInteractionStore(
    useShallow((s) => (s.mode.kind === 'ofdFlow' ? s.mode.data : null)),
  );
}

// ── Imperative getters (event handlers / actions) ────────────────────────────

export function getCableDrawing(): CableDrawingData | null {
  const m = useInteractionStore.getState().mode;
  return m.kind === 'cableDrawing' ? m.data : null;
}

export function getOfdFlow(): OfdFlowData | null {
  const m = useInteractionStore.getState().mode;
  return m.kind === 'ofdFlow' ? m.data : null;
}
