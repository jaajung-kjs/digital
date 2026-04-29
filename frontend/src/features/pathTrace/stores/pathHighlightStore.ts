import { create } from 'zustand';
import { traceCable } from '../../../utils/cableTracer';
import { useEditorStore } from '../../editor/stores/editorStore';
import { useSnapshotStore } from '../../editor/stores/snapshotStore';
import { api } from '../../../utils/api';
import { isTempId } from '../../../utils/idHelpers';
import type { TraceResult, PathSegment } from '../types';
import type { FiberPathDetail } from '../../fiber/types';

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

  startTrace: (cableId: string, currentRoomId: string) => void;
  openModal: () => void;
  closeModal: () => void;
  selectRing: (ringId: string | null) => void;
  /** Full reset — clears everything back to idle */
  clearHighlight: () => void;
}

export const usePathHighlightStore = create<PathHighlightState>((set, get) => ({
  ...IDLE_STATE,

  startTrace: async (cableId, _currentRoomId) => {
    // Use snapshot data if preview is active, otherwise use current editor state
    const snapshotState = useSnapshotStore.getState();
    const editorState = useEditorStore.getState();
    const localCables = snapshotState.active ? snapshotState.cables : editorState.localCables;
    const localEquipment = snapshotState.active ? snapshotState.equipment : editorState.localEquipment;
    const pendingFiberPaths = snapshotState.active ? [] : editorState.pendingFiberPaths;

    // isLoading is reserved for potential future async trace UI feedback
    set({ tracingCableId: cableId, error: null });

    try {
      // In snapshot mode, use snapshot fiber paths directly (no server fetch)
      if (snapshotState.active) {
        const snapshotFiberPaths: FiberPathDetail[] = (snapshotState.fiberPaths ?? []).map((fp: any) => ({
          id: fp.id,
          ofdA: { id: fp.ofdAId, name: '?', substationName: '', floorId: null },
          ofdB: { id: fp.ofdBId, name: '?', substationName: '', floorId: null },
          portCount: fp.portCount,
          description: fp.description ?? null,
          createdAt: '', updatedAt: '',
        } as FiberPathDetail));

        const result = traceCable({
          cableId,
          cables: localCables,
          equipment: localEquipment,
          fiberPaths: snapshotFiberPaths,
        });

        set({
          active: true,
          traceResult: result,
          highlightedNodeIds: new Set(result.nodes.map((n) => n.equipmentId)),
          highlightedEdgeIds: new Set(result.edges.map((e) => e.id)),
          segments: result.segments,
          modalOpen: false,
          selectedRingId: null,
        });
        return;
      }

      // Normal mode: fetch saved fiber paths from API
      const ofdEquipment = localEquipment.filter(
        (e) => e.category === 'OFD' && !isTempId(e.id),
      );
      const savedFiberPaths: FiberPathDetail[] = [];
      const seenFpIds = new Set<string>();
      await Promise.all(
        ofdEquipment.map(async (ofd) => {
          try {
            const { data } = await api.get<{ data: FiberPathDetail[] }>(
              `/equipment/${ofd.id}/fiber-paths`,
            );
            for (const fp of data.data) {
              if (!seenFpIds.has(fp.id)) {
                seenFpIds.add(fp.id);
                savedFiberPaths.push(fp);
              }
            }
          } catch {
            // OFD fiber path fetch failed — trace without it
          }
        }),
      );

      // Merge saved fiber paths with pending ones
      const equipMap = new Map(localEquipment.map((e) => [e.id, e]));
      const allFiberPaths: FiberPathDetail[] = [
        ...savedFiberPaths,
        // Convert pending fiber paths to FiberPathDetail-like objects
        ...pendingFiberPaths.map((fp) => {
          const ofdA = equipMap.get(fp.ofdAId);
          const ofdB = equipMap.get(fp.ofdBId);
          return {
            id: fp.id,
            ofdA: {
              id: fp.ofdAId,
              name: ofdA?.name ?? '?',
              substationName: '',
              floorId: null,
            },
            ofdB: {
              id: fp.ofdBId,
              name: ofdB?.name ?? '?',
              substationName: '',
              floorId: null,
            },
            portCount: fp.portCount,
            description: fp.description ?? null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as FiberPathDetail;
        }),
      ];

      const result = traceCable({
        cableId,
        cables: localCables,
        equipment: localEquipment,
        fiberPaths: allFiberPaths,
      });

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

  openModal: () => {
    const { traceResult, tracingCableId } = get();
    if (!traceResult || !tracingCableId) {
      set({ modalOpen: true });
      return;
    }
    // Find the ring containing the traced cable.
    const tracedEdge = traceResult.edges.find((e) => e.id === tracingCableId);
    let myRing = null;
    if (tracedEdge) {
      const endpoints = [tracedEdge.sourceEquipmentId, tracedEdge.targetEquipmentId];
      for (const ring of traceResult.rings) {
        if (ring.level !== 0) continue;
        if (endpoints.some((eqId) => ring.nodeIds.includes(eqId))) {
          myRing = ring;
          break;
        }
      }
    }
    if (myRing) {
      set({
        modalOpen: true,
        selectedRingId: myRing.id,
        highlightedNodeIds: new Set(myRing.nodeIds),
        highlightedEdgeIds: new Set(myRing.edgeIds),
      });
    } else {
      set({ modalOpen: true });
    }
  },

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
