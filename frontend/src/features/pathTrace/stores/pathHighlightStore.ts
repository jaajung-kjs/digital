/**
 * Cable trace 단일 store — 시드 cable 1회 추적 결과로 *세 가지* 를 동시에 먹인다:
 *   1. 캔버스 하이라이트 (highlightedNodeIds/PlacedIds/EdgeIds)
 *   2. PathTraceDetail 경로 상세 텍스트 (projection)
 *   3. 네트워크 토폴로지 모달 (projection, modalOpen 으로 토글)
 *
 * 데이터는 GLOBAL(전 변전소) slim-assets + cables 위에 *이 변전소* staged 변경을
 * 오버레이한 superset. 로컬 하이라이트는 그 superset 의 subset 이므로 한 번의 trace 로
 * 하이라이트·토폴로지 양쪽을 충족한다 — 더 이상 scope 별로 재추적하지 않는다.
 * "상세" 버튼은 이미 계산된 projection 을 그대로 모달에 띄운다(openTopology — 재추적 X).
 */

import { create } from 'zustand';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { floorAnchor } from '../../workingCopy/floorAnchor';
import { toMapById } from '../../../utils/byId';
import { cableDtoToLocal, type CableDetailDTO } from '../../workingCopy/cableToLocal';
import { queryClient } from '../../../lib/queryClient';
import { api } from '../../../utils/api';
import type { LocalCable } from '../../editor/stores/editorStore';
import type { Asset } from '../../../types/asset';
import { projectTrace, type TraceProjection } from '../../trace/traceProjection';
import { buildTraceGraph, fetchAllSlimAssetsCached, type SlimAssetDTO, type TraceCableInput } from '../../trace/traceGraph';

/**
 * 글로벌(전 변전소) cable 위에 *이 변전소* 의 staged 변경을 오버레이.
 *
 * - `deletes` 에 있는 id 는 제거.
 * - 나머지 글로벌 cable 중 이 변전소 id 는 effective(saved+staged) 버전으로 교체.
 * - 글로벌에 없는 staged-create(임시 id) 는 새로 추가.
 *
 * 결과: 다른 변전소 cable 은 글로벌 원본 그대로(cross-substation hop 가능),
 * 이 변전소 cable 은 방금 그린 staged 변경이 반영된 버전.
 */
export function overlayStagedOntoGlobal(
  globalCables: LocalCable[],
  stagedCables: LocalCable[],
  deletes: string[],
): LocalCable[] {
  const stagedById = toMapById(stagedCables);
  const deleted = new Set(deletes);
  const merged = globalCables
    .filter((c) => !deleted.has(c.id))
    .map((c) => stagedById.get(c.id) ?? c);
  // 글로벌에 없던 staged-create (임시 id) 추가.
  const seen = new Set(merged.map((c) => c.id));
  for (const c of stagedCables) {
    if (!seen.has(c.id) && !deleted.has(c.id)) merged.push(c);
  }
  return merged;
}

function idleState() {
  return {
    active: false,
    projection: null as TraceProjection | null,
    tracingCableId: null as string | null,
    isLoading: false,
    error: null as string | null,
    highlightedNodeIds: new Set<string>(),
    /** module id 가 부모 랙 id 로 펼쳐진 set — 캔버스는 모듈을 따로 안 그림. */
    highlightedPlacedIds: new Set<string>(),
    highlightedEdgeIds: new Set<string>(),
    // 토폴로지 모달 상태 — 같은 trace 결과를 공유.
    modalOpen: false,
  };
}

/**
 * 하이라이트할 노드 id(설비/모듈/분기 asset 혼재)를 캔버스가 실제로 그리는
 * 배치(placement) 설비 id 로 펼친다. 모듈/분기 같은 내부 노드는 floorAnchor 가
 * 가장 가까운 배치 조상(랙/분전반)으로 해소한다(branch→feeder→분전반 walk 포함).
 */
function expandToPlacedIds(nodeIds: Set<string>, effectiveAssets: Asset[]): Set<string> {
  const result = new Set(nodeIds);
  const byId = toMapById(effectiveAssets);
  for (const id of nodeIds) {
    const anchor = floorAnchor(id, byId);
    if (anchor) result.add(anchor.id);
  }
  return result;
}

interface PathHighlightState {
  active: boolean;
  projection: TraceProjection | null;
  tracingCableId: string | null;
  isLoading: boolean;
  error: string | null;
  highlightedNodeIds: Set<string>;
  highlightedPlacedIds: Set<string>;
  highlightedEdgeIds: Set<string>;
  /** 토폴로지 모달 표시 여부 — projection 을 공유, 별도 추적 없음. */
  modalOpen: boolean;

  startTrace: (cableId: string) => void;
  /** 연결도(가지친 트리)의 노드/케이블을 그대로 하이라이트 — 재추적 없음(projectTrace 불일치 방지). */
  highlightDiagram: (seedCableId: string, nodeIds: string[], cableIds: string[]) => void;
  /**
   * 전원 계통 추적 (상위 진입) — 분전반 회로(feeder/branch) 에서 fan-out.
   * 주어진 circuitId 들에 물린 케이블 + 반대편 endpoint 를 1-hop 하이라이트.
   */
  startCircuitTrace: (circuitIds: string[]) => void;
  /** 이미 계산된 projection 으로 토폴로지 모달 열기 — 재추적 없음. */
  openTopology: () => void;
  /** 토폴로지 모달 닫기 — trace/하이라이트는 유지(닫기만). */
  closeTopology: () => void;
  clearHighlight: () => void;
}

export const usePathHighlightStore = create<PathHighlightState>((set) => ({
  ...idleState(),

  startTrace: async (cableId) => {
    set({ tracingCableId: cableId, isLoading: true, error: null });
    try {
      const slimAssets = await fetchAllSlimAssetsCached(queryClient);
      const globalCables = await queryClient.fetchQuery({
        queryKey: ['cables'], staleTime: 30_000,
        queryFn: async () => (await api.get<{ data: TraceCableInput[] }>('/cables')).data.data,
      });
      const wc = useSubstationWorkingCopy.getState();
      const graph = buildTraceGraph({
        slimAssets: slimAssets as SlimAssetDTO[],
        globalCables,
        stagedAssets: wc.effectiveAssets() as never[],
        stagedCables: wc.effectiveCables() as unknown as TraceCableInput[],
        deletes: [...wc.overlays.cables.deletes, ...wc.overlays.assets.deletes],
      });
      const projection = projectTrace(cableId, graph);
      if (!projection) {
        set({ isLoading: false, tracingCableId: null, error: '시드 케이블을 찾을 수 없습니다. 삭제되었거나 캐시가 갱신되지 않았을 수 있습니다.' });
        return;
      }
      const ids = new Set(projection.nodeIds);
      set({
        active: true,
        projection,
        isLoading: false,
        highlightedNodeIds: ids,
        highlightedPlacedIds: expandToPlacedIds(ids, wc.effectiveAssets()),
        highlightedEdgeIds: new Set(projection.cableIds),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '경로 추적에 실패했습니다.';
      set({ isLoading: false, tracingCableId: null, error: message });
    }
  },

  highlightDiagram: (seedCableId, nodeIds, cableIds) => {
    const effAssets = useSubstationWorkingCopy.getState().effectiveAssets();
    const ids = new Set(nodeIds);
    set({
      active: true,
      projection: null,
      tracingCableId: seedCableId,
      isLoading: false,
      error: null,
      highlightedNodeIds: ids,
      highlightedPlacedIds: expandToPlacedIds(ids, effAssets),
      highlightedEdgeIds: new Set(cableIds),
      modalOpen: false,
    });
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
      projection: null,
      tracingCableId: null,
      isLoading: false,
      error: null,
      highlightedNodeIds: nodeIds,
      highlightedPlacedIds: expandToPlacedIds(nodeIds, effAssets),
      highlightedEdgeIds: edgeIds,
      modalOpen: false,
    });
  },

  openTopology: () => set({ modalOpen: true }),
  closeTopology: () => set({ modalOpen: false }),

  clearHighlight: () => set(idleState()),
}));
