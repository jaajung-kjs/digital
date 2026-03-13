import { create } from 'zustand';
import { api } from '../../../utils/api';
import type { TraceResult } from '../types';

interface PathHighlightState {
  active: boolean;
  mode: 'canvas' | 'modal' | null;
  traceResult: TraceResult | null;
  tracingCableId: string | null;
  isLoading: boolean;
  selectedRingId: string | null;
  highlightedNodeIds: Set<string>;
  highlightedEdgeIds: Set<string>;

  startTrace: (cableId: string, currentRoomId: string) => Promise<void>;
  selectRing: (ringId: string | null) => void;
  clearHighlight: () => void;
}

function determineMode(result: TraceResult, currentRoomId: string): 'canvas' | 'modal' {
  const allSameRoom = result.nodes.every((n) => n.roomId === currentRoomId);
  return allSameRoom ? 'canvas' : 'modal';
}

export const usePathHighlightStore = create<PathHighlightState>((set, get) => ({
  active: false,
  mode: null,
  traceResult: null,
  tracingCableId: null,
  isLoading: false,
  selectedRingId: null,
  highlightedNodeIds: new Set(),
  highlightedEdgeIds: new Set(),

  startTrace: async (cableId, currentRoomId) => {
    set({ isLoading: true, tracingCableId: cableId });
    try {
      const { data } = await api.get<{ data: TraceResult }>(`/cables/${cableId}/trace`);
      const result = data.data;
      const mode = determineMode(result, currentRoomId);
      const nodeIds = new Set(result.nodes.map((n) => n.equipmentId));
      const edgeIds = new Set(result.edges.map((e) => e.id));
      set({
        active: true,
        mode,
        traceResult: result,
        isLoading: false,
        selectedRingId: null,
        highlightedNodeIds: nodeIds,
        highlightedEdgeIds: edgeIds,
      });
    } catch {
      set({ isLoading: false, tracingCableId: null });
    }
  },

  selectRing: (ringId) => {
    const { traceResult } = get();
    if (!traceResult) return;
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
      mode: null,
      traceResult: null,
      tracingCableId: null,
      isLoading: false,
      selectedRingId: null,
      highlightedNodeIds: new Set(),
      highlightedEdgeIds: new Set(),
    }),
}));
