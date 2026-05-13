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
  /** highlightedNodeIds 에 module id 가 섞여 들어올 수 있는데 캔버스는 모듈을
   *  별도로 그리지 않으므로, dim/highlight 분기가 매 프레임 부모 랙으로 펼치는
   *  loop 를 돌렸다. 그걸 한 번만 — trace 결정 시점에 — 계산해 두는 사전 set. */
  highlightedEquipmentIds: new Set<string>(),
  highlightedEdgeIds: new Set<string>(),
  segments: [] as PathSegment[],
} as const;

/** module id 가 들어 있으면 그 부모 랙 id 도 함께 포함하는 equipment id set. */
function expandToEquipmentIds(nodeIds: Set<string>): Set<string> {
  const result = new Set(nodeIds);
  const rackModules = useEditorStore.getState().localRackModules;
  for (const mod of rackModules) {
    if (nodeIds.has(mod.id)) result.add(mod.rackEquipmentId);
  }
  return result;
}

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
  /** equipmentId 단위 강조 set — 모듈 id 가 부모 랙 id 로 펼쳐진 형태. */
  highlightedEquipmentIds: Set<string>;
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
    // snapshot store 는 모듈 record 를 따로 들고 있지 않으므로 빈 배열. 모듈 이름
    // 미해상되면 부모 랙 이름 fallback 으로 떨어지는 게 자연스러움.
    const localRackModules = snapshotState.active ? [] : editorState.localRackModules;
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
          rackModules: localRackModules,
          fiberPaths: snapshotFiberPaths,
        });

        const snapshotNodeIds = new Set(result.nodes.map((n) => n.equipmentId));
        set({
          active: true,
          traceResult: result,
          highlightedNodeIds: snapshotNodeIds,
          highlightedEquipmentIds: expandToEquipmentIds(snapshotNodeIds),
          highlightedEdgeIds: new Set(result.edges.map((e) => e.id)),
          segments: result.segments,
          modalOpen: false,
          selectedRingId: null,
        });
        return;
      }

      // Normal mode: fetch saved fiber paths from API
      const ofdEquipment = localEquipment.filter(
        (e) => e.kind === 'OFD' && !isTempId(e.id),
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
        rackModules: localRackModules,
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
        highlightedEquipmentIds: expandToEquipmentIds(nodeIds),
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
      const ringNodeIds = new Set(myRing.nodeIds);
      set({
        modalOpen: true,
        selectedRingId: myRing.id,
        highlightedNodeIds: ringNodeIds,
        highlightedEquipmentIds: expandToEquipmentIds(ringNodeIds),
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
      const allNodeIds = new Set(traceResult.nodes.map((n) => n.equipmentId));
      set({
        selectedRingId: null,
        highlightedNodeIds: allNodeIds,
        highlightedEquipmentIds: expandToEquipmentIds(allNodeIds),
        highlightedEdgeIds: new Set(traceResult.edges.map((e) => e.id)),
      });
      return;
    }
    const ring = traceResult.rings.find((r) => r.id === ringId);
    if (!ring) return;
    const ringNodeIds = new Set(ring.nodeIds);
    set({
      selectedRingId: ringId,
      highlightedNodeIds: ringNodeIds,
      highlightedEquipmentIds: expandToEquipmentIds(ringNodeIds),
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
      highlightedEquipmentIds: new Set(),
      highlightedEdgeIds: new Set(),
      segments: [],
    }),
}));
