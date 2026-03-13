import { create } from 'zustand';
import { api } from '../../../utils/api';
import { useEditorStore } from '../../editor/stores/editorStore';
import type { TraceResult } from '../types';

interface PathHighlightState {
  active: boolean;
  mode: 'canvas' | 'modal' | null;
  traceResult: TraceResult | null;
  tracingCableId: string | null;
  isLoading: boolean;
  error: string | null;
  selectedRingId: string | null;
  highlightedNodeIds: Set<string>;
  highlightedEdgeIds: Set<string>;

  startTrace: (cableId: string, currentRoomId: string) => Promise<void>;
  selectRing: (ringId: string | null) => void;
  closeModal: () => void;
  clearHighlight: () => void;
}

function determineMode(result: TraceResult, currentRoomId: string): 'canvas' | 'modal' {
  const allSameRoom = result.nodes.every((n) => n.roomId === currentRoomId);
  if (!allSameRoom) return 'modal';
  // Auto-switch to connection viewMode for canvas highlight
  const { viewMode, setViewMode } = useEditorStore.getState();
  if (viewMode !== 'connection') {
    setViewMode('connection');
  }
  return 'canvas';
}

export const usePathHighlightStore = create<PathHighlightState>((set, get) => ({
  active: false,
  mode: null,
  traceResult: null,
  tracingCableId: null,
  isLoading: false,
  error: null,
  selectedRingId: null,
  highlightedNodeIds: new Set(),
  highlightedEdgeIds: new Set(),

  startTrace: async (cableId, currentRoomId) => {
    set({ isLoading: true, tracingCableId: cableId, error: null });
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
    } catch (err) {
      const message = err instanceof Error ? err.message : '경로 추적에 실패했습니다.';
      set({ isLoading: false, tracingCableId: null, error: message });
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

  closeModal: () => set({ mode: null }),

  clearHighlight: () =>
    set({
      active: false,
      mode: null,
      traceResult: null,
      tracingCableId: null,
      isLoading: false,
      error: null,
      selectedRingId: null,
      highlightedNodeIds: new Set(),
      highlightedEdgeIds: new Set(),
    }),
}));
