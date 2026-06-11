/**
 * Cable trace highlight store — 캔버스 하이라이트 + PathTraceDetail (경로 상세 텍스트).
 *
 * 네트워크 토폴로지 (외부망) 는 별도 store: `useNetworkTopologyStore` (features/network/store).
 * "상세" 버튼은 cable card 가 직접 networkTopologyStore.loadAndOpen 을 호출 — 이 store 는
 * cable trace 만 책임진다.
 */

import { create } from 'zustand';
import { traceCable } from '../../../utils/cableTracer';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { assetsByIdMap, floorAnchor } from '../../workingCopy/floorAnchor';
import { cableDtoToLocal, type CableDetailDTO } from '../../network/store';
import { ensureOfdDirectory } from '../../fiber/hooks/useOfdDirectory';
import { composeFiberPaths } from '../../workingCopy/merge';
import type { TraceResult, PathSegment } from '../types';
import type { LocalCable } from '../../editor/stores/editorStore';
import type { Asset } from '../../../types/asset';

function idleState() {
  return {
    active: false,
    traceResult: null as TraceResult | null,
    tracingCableId: null as string | null,
    isLoading: false,
    error: null as string | null,
    highlightedNodeIds: new Set<string>(),
    /** module id 가 부모 랙 id 로 펼쳐진 set — 캔버스는 모듈을 따로 안 그림. */
    highlightedPlacedIds: new Set<string>(),
    highlightedEdgeIds: new Set<string>(),
    segments: [] as PathSegment[],
  };
}

/**
 * 하이라이트할 노드 id(설비/모듈/분기 asset 혼재)를 캔버스가 실제로 그리는
 * 배치(placement) 설비 id 로 펼친다. 모듈/분기 같은 내부 노드는 floorAnchor 가
 * 가장 가까운 배치 조상(랙/분전반)으로 해소한다(branch→feeder→분전반 walk 포함).
 */
function expandToPlacedIds(nodeIds: Set<string>, effectiveAssets: Asset[]): Set<string> {
  const result = new Set(nodeIds);
  const byId = assetsByIdMap(effectiveAssets);
  for (const id of nodeIds) {
    const anchor = floorAnchor(id, byId);
    if (anchor) result.add(anchor.id);
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
  highlightedPlacedIds: Set<string>;
  highlightedEdgeIds: Set<string>;
  segments: PathSegment[];

  startTrace: (cableId: string) => void;
  /**
   * 전원 계통 추적 (상위 진입) — 분전반 회로(feeder/branch) 에서 fan-out.
   * 주어진 circuitId 들에 물린 케이블 + 반대편 endpoint 를 1-hop 하이라이트.
   */
  startCircuitTrace: (circuitIds: string[]) => void;
  clearHighlight: () => void;
}

export const usePathHighlightStore = create<PathHighlightState>((set) => ({
  ...idleState(),

  startTrace: async (cableId) => {
    set({ tracingCableId: cableId, error: null });

    try {
      // SSOT-2d-3b: editorStore 영속 컬렉션 제거. cable/equipment/
      // rackModule/fiberPath 는 변전소 단위 통합 working copy 의 effective(saved+staged)
      // 에서 가져온다(network/store.loadAndOpen 과 동일 패턴). fiber path 표시명은
      // OFD directory 로 합성.
      const directory = await ensureOfdDirectory();
      const wc = useSubstationWorkingCopy.getState();
      const localCables: LocalCable[] = wc
        .effectiveCables()
        .map((c) => cableDtoToLocal(c as unknown as CableDetailDTO));
      const effAssets = wc.effectiveAssets();
      const localEquipment: Asset[] = effAssets
        .filter((a) => !(a.parentAssetId && a.slotIndex != null));
      const localRackModules: Asset[] = effAssets
        .filter((a) => a.parentAssetId && a.slotIndex != null);
      const allFiberPaths = composeFiberPaths(
        wc.effectiveFiberPaths() as unknown as Array<{ id: string; ofdAId: string; ofdBId: string; portCount: number; description?: string | null }>,
        directory,
      );

      const result = traceCable({
        cableId,
        cables: localCables,
        equipment: localEquipment,
        rackModules: localRackModules,
        assets: effAssets,
        fiberPaths: allFiberPaths,
      });

      const ids = new Set(result.nodes.map((n) => n.nodeId));
      set({
        active: true,
        traceResult: result,
        isLoading: false,
        highlightedNodeIds: ids,
        highlightedPlacedIds: expandToPlacedIds(ids, effAssets),
        highlightedEdgeIds: new Set(result.edges.map((e) => e.id)),
        segments: result.segments,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '경로 추적에 실패했습니다.';
      set({ isLoading: false, tracingCableId: null, error: message });
    }
  },

  startCircuitTrace: (branchAssetIds) => {
    if (branchAssetIds.length === 0) return;
    // 단계3b: 회로는 BRANCH asset. 인자는 분기 asset id 들. 케이블 endpoint 가
    //   단일 asset id(flat sourceAssetId 자리)이므로 그 id 가 분기 집합에 들면 hit.
    const wc = useSubstationWorkingCopy.getState();
    const cables: LocalCable[] = wc
      .effectiveCables()
      .map((c) => cableDtoToLocal(c as unknown as CableDetailDTO));
    const effAssets = wc.effectiveAssets();

    const branchSet = new Set(branchAssetIds);
    const nodeIds = new Set<string>(branchAssetIds);
    const edgeIds = new Set<string>();
    for (const cable of cables) {
      const srcHit = !!cable.sourceAssetId && branchSet.has(cable.sourceAssetId);
      const tgtHit = !!cable.targetAssetId && branchSet.has(cable.targetAssetId);
      if (!srcHit && !tgtHit) continue;
      edgeIds.add(cable.id);
      nodeIds.add(cable.sourceAssetId);
      nodeIds.add(cable.targetAssetId);
    }
    set({
      active: true,
      traceResult: null,
      tracingCableId: null,
      isLoading: false,
      error: null,
      highlightedNodeIds: nodeIds,
      highlightedPlacedIds: expandToPlacedIds(nodeIds, effAssets),
      highlightedEdgeIds: edgeIds,
      segments: [],
    });
  },

  clearHighlight: () => set(idleState()),
}));
