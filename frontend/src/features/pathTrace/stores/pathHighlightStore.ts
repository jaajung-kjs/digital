import { create } from 'zustand';
import { api } from '../../../utils/api';
import type { TraceResult, PathSegment } from '../types';

/** Initial (idle) state — single source of truth for "nothing active" */
const IDLE_STATE = {
  active: false,
  modalOpen: false,
  traceResult: null as TraceResult | null,
  tracingCableId: null as string | null,
  isLoading: false,
  error: null as string | null,
  selectedRingId: null as string | null,
  highlightedNodeIds: new Set<string>(),
  highlightedEdgeIds: new Set<string>(),
  segments: [] as PathSegment[],
} as const;

interface PathHighlightState {
  /** Trace is active — controls canvas highlight, path detail panel, card selection */
  active: boolean;
  /** Topology modal is open (independent of active — modal can be open while canvas highlights) */
  modalOpen: boolean;
  traceResult: TraceResult | null;
  tracingCableId: string | null;
  isLoading: boolean;
  error: string | null;
  selectedRingId: string | null;
  highlightedNodeIds: Set<string>;
  highlightedEdgeIds: Set<string>;
  segments: PathSegment[];

  /** Select a cable without tracing (e.g. pending/unsaved cables) */
  selectCable: (cableId: string) => void;
  startTrace: (cableId: string, currentRoomId: string) => Promise<void>;
  openModal: () => void;
  closeModal: () => void;
  selectRing: (ringId: string | null) => void;
  /** Full reset — clears everything back to idle */
  clearHighlight: () => void;
}

export const usePathHighlightStore = create<PathHighlightState>((set, get) => ({
  ...IDLE_STATE,

  selectCable: (cableId) =>
    set({ active: true, tracingCableId: cableId, traceResult: null, segments: [] }),

  startTrace: async (cableId, _currentRoomId) => {
    set({ isLoading: true, tracingCableId: cableId, error: null });
    try {
      const { data } = await api.get<{ data: TraceResult }>(`/cables/${cableId}/trace`);
      const result = data.data;
      const nodeIds = new Set(result.nodes.map((n) => n.equipmentId));
      const edgeIds = new Set(result.edges.map((e) => e.id));
      set({
        active: true,
        modalOpen: false,
        traceResult: result,
        isLoading: false,
        selectedRingId: null,
        highlightedNodeIds: nodeIds,
        highlightedEdgeIds: edgeIds,
        segments: result.segments,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '경로 추적에 실패했습니다.';
      set({ isLoading: false, tracingCableId: null, error: message });
    }
  },

  openModal: () => set({ modalOpen: true }),

  closeModal: () => set({ modalOpen: false }),

  selectRing: (ringId) => {
    const { traceResult, selectedRingId } = get();
    if (!traceResult || ringId === selectedRingId) return;
    if (!ringId) {
      set({
        selectedRingId: null,
        highlightedNodeIds: new Set(traceResult.nodes.map((n) => n.equipmentId)),
        highlightedEdgeIds: new Set(traceResult.edges.map((e) => e.id)),
      });
      return;
    }
    const ring = traceResult.rings.find((r) => r.id === ringId);
    if (!ring) return;
    set({
      selectedRingId: ringId,
      highlightedNodeIds: new Set(ring.nodeIds),
      highlightedEdgeIds: new Set(ring.edgeIds),
    });
  },

  clearHighlight: () =>
    set({
      active: false,
      modalOpen: false,
      traceResult: null,
      tracingCableId: null,
      isLoading: false,
      error: null,
      selectedRingId: null,
      highlightedNodeIds: new Set(),
      highlightedEdgeIds: new Set(),
      segments: [],
    }),
}));
