/**
 * Cable trace highlight store — 캔버스 하이라이트 + PathTraceDetail (경로 상세 텍스트).
 *
 * 네트워크 토폴로지 (외부망) 는 별도 store: `useNetworkTopologyStore` (features/network/store).
 * "상세" 버튼은 cable card 가 직접 networkTopologyStore.loadAndOpen 을 호출 — 이 store 는
 * cable trace 만 책임진다.
 */

import { create } from 'zustand';
import { traceCable } from '../../../utils/cableTracer';
import { useEditorStore } from '../../editor/stores/editorStore';
import { useSnapshotStore } from '../../editor/stores/snapshotStore';
import { useNetworkTopologyStore } from '../../network/store';
import { pendingToFiberPathDetail } from '../../fiber/pending';
import { api } from '../../../utils/api';
import type { TraceResult, PathSegment } from '../types';
import type { FiberPathDetail } from '../../fiber/types';

function idleState() {
  return {
    active: false,
    traceResult: null as TraceResult | null,
    tracingCableId: null as string | null,
    isLoading: false,
    error: null as string | null,
    highlightedNodeIds: new Set<string>(),
    /** module id 가 부모 랙 id 로 펼쳐진 set — 캔버스는 모듈을 따로 안 그림. */
    highlightedEquipmentIds: new Set<string>(),
    highlightedEdgeIds: new Set<string>(),
    segments: [] as PathSegment[],
  };
}

function expandToEquipmentIds(nodeIds: Set<string>): Set<string> {
  const result = new Set(nodeIds);
  const state = useEditorStore.getState();
  for (const mod of state.localRackModules) {
    if (nodeIds.has(mod.id)) result.add(mod.rackEquipmentId);
  }
  for (const c of state.localDistributionCircuits) {
    if (nodeIds.has(c.id)) result.add(c.distributionEquipmentId);
  }
  return result;
}

interface PathHighlightState {
  active: boolean;
  traceResult: TraceResult | null;
  tracingCableId: string | null;
  isLoading: boolean;
  error: string | null;
  highlightedNodeIds: Set<string>;
  highlightedEquipmentIds: Set<string>;
  highlightedEdgeIds: Set<string>;
  segments: PathSegment[];

  startTrace: (cableId: string, currentRoomId: string) => void;
  /**
   * 전원 계통 추적 (상위 진입) — 분전반 회로(feeder/branch) 에서 fan-out.
   * 주어진 circuitId 들에 물린 케이블 + 반대편 endpoint 를 1-hop 하이라이트.
   */
  startCircuitTrace: (circuitIds: string[]) => void;
  clearHighlight: () => void;
}

export const usePathHighlightStore = create<PathHighlightState>((set) => ({
  ...idleState(),

  startTrace: async (cableId, _currentRoomId) => {
    const snapshotState = useSnapshotStore.getState();
    const editorState = useEditorStore.getState();
    const localCables = snapshotState.active ? snapshotState.cables : editorState.localCables;
    const localEquipment = snapshotState.active ? snapshotState.equipment : editorState.localEquipment;
    const localRackModules = snapshotState.active ? [] : editorState.localRackModules;
    const localDistCircuits = snapshotState.active ? [] : editorState.localDistributionCircuits;

    set({ tracingCableId: cableId, error: null });

    try {
      // Snapshot mode — use snapshot fiber paths directly.
      if (snapshotState.active) {
        // snapshot 의 fiberPaths 는 ofdAId/ofdBId/portCount/description 만 — pending 과 같은 shape.
        const emptyEquipMap = new Map<string, { name: string }>();
        const snapshotFiberPaths: FiberPathDetail[] = (snapshotState.fiberPaths ?? []).map((fp: any) =>
          pendingToFiberPathDetail(fp, emptyEquipMap),
        );

        const result = traceCable({
          cableId,
          cables: localCables,
          equipment: localEquipment,
          rackModules: localRackModules,
          distributionCircuits: localDistCircuits,
          fiberPaths: snapshotFiberPaths,
        });

        const ids = new Set(result.nodes.map((n) => n.equipmentId));
        set({
          active: true,
          traceResult: result,
          highlightedNodeIds: ids,
          highlightedEquipmentIds: expandToEquipmentIds(ids),
          highlightedEdgeIds: new Set(result.edges.map((e) => e.id)),
          segments: result.segments,
        });
        return;
      }

      // Normal mode — fiber paths from network store cache or fetch.
      // network/store 와 단일 source 공유 — 한쪽이 fetch 하면 다른 쪽도 캐시 hit.
      let savedFiberPaths = useNetworkTopologyStore.getState().savedFiberPaths;
      if (!savedFiberPaths) {
        try {
          const { data } = await api.get<{ data: FiberPathDetail[] }>('/fiber-paths');
          savedFiberPaths = data.data;
          useNetworkTopologyStore.setState({ savedFiberPaths });
        } catch {
          savedFiberPaths = [];
        }
      }

      // Pending fiber paths (unsaved local) overlay
      const equipMap = new Map(editorState.localEquipment.map((e) => [e.id, e]));
      const pendingFps = editorState.pendingFiberPaths.map((fp) => pendingToFiberPathDetail(fp, equipMap));
      const deletedFps = new Set(editorState.deletedFiberPathIds);
      const allFiberPaths = [...savedFiberPaths.filter((fp) => !deletedFps.has(fp.id)), ...pendingFps];

      const result = traceCable({
        cableId,
        cables: localCables,
        equipment: localEquipment,
        rackModules: localRackModules,
        distributionCircuits: localDistCircuits,
        fiberPaths: allFiberPaths,
      });

      const ids = new Set(result.nodes.map((n) => n.equipmentId));
      set({
        active: true,
        traceResult: result,
        isLoading: false,
        highlightedNodeIds: ids,
        highlightedEquipmentIds: expandToEquipmentIds(ids),
        highlightedEdgeIds: new Set(result.edges.map((e) => e.id)),
        segments: result.segments,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '경로 추적에 실패했습니다.';
      set({ isLoading: false, tracingCableId: null, error: message });
    }
  },

  startCircuitTrace: (circuitIds) => {
    if (circuitIds.length === 0) return;
    const editorState = useEditorStore.getState();
    const circuitSet = new Set(circuitIds);
    const nodeIds = new Set<string>(circuitIds);
    const edgeIds = new Set<string>();
    for (const cable of editorState.localCables) {
      const srcHit = !!cable.sourceCircuitId && circuitSet.has(cable.sourceCircuitId);
      const tgtHit = !!cable.targetCircuitId && circuitSet.has(cable.targetCircuitId);
      if (!srcHit && !tgtHit) continue;
      edgeIds.add(cable.id);
      nodeIds.add(cable.sourceEquipmentId);
      nodeIds.add(cable.targetEquipmentId);
    }
    set({
      active: true,
      traceResult: null,
      tracingCableId: null,
      isLoading: false,
      error: null,
      highlightedNodeIds: nodeIds,
      highlightedEquipmentIds: expandToEquipmentIds(nodeIds),
      highlightedEdgeIds: edgeIds,
      segments: [],
    });
  },

  clearHighlight: () => set(idleState()),
}));
