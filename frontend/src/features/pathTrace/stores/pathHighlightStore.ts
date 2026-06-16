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
export function expandToPlacedIds(nodeIds: Set<string>, effectiveAssets: Asset[]): Set<string> {
  const result = new Set(nodeIds);
  const byId = toMapById(effectiveAssets);
  for (const id of nodeIds) {
    const anchor = floorAnchor(id, byId);
    if (anchor) result.add(anchor.id);
  }
  return result;
}

/**
 * 시드 cable 1회 추적 → projection + nodeIds. 그래프 빌드(global slim-assets + cables
 * 위에 이 변전소 staged 오버레이)는 비동기. 파생 작성자(prepareTopology)만 사용한다.
 */
async function loadProjection(cableId: string): Promise<
  | { ok: true; projection: TraceProjection; ids: Set<string> }
  | { ok: false; error: string }
> {
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
      return { ok: false, error: '시드 케이블을 찾을 수 없습니다. 삭제되었거나 캐시가 갱신되지 않았을 수 있습니다.' };
    }
    return { ok: true, projection, ids: new Set(projection.nodeIds) };
  } catch (err) {
    const message = err instanceof Error ? err.message : '경로 추적에 실패했습니다.';
    return { ok: false, error: message };
  }
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

  /** 파생 전용 — useSelectionHighlight 만 호출. */
  setHighlight: (h: { cableId: string | null; nodeIds: Set<string>; placedIds: Set<string>; cableIds: Set<string> }) => void;
  /** 토폴로지 모달용 projection 비동기 빌드 후 모달 열기 — 하이라이트는 파생 캐시가 별도 작성. */
  prepareTopology: (cableId: string) => Promise<void>;
  /** 이미 계산된 projection 으로 토폴로지 모달 열기 — 재추적 없음. */
  openTopology: () => void;
  /** 토폴로지 모달 닫기 — trace/하이라이트는 유지(닫기만). */
  closeTopology: () => void;
  clearHighlight: () => void;
}

export const usePathHighlightStore = create<PathHighlightState>((set) => ({
  ...idleState(),

  setHighlight: (h) =>
    set({
      active: true,
      tracingCableId: h.cableId,
      isLoading: false,
      error: null,
      highlightedNodeIds: h.nodeIds,
      highlightedPlacedIds: h.placedIds,
      highlightedEdgeIds: h.cableIds,
    }),

  prepareTopology: async (cableId) => {
    set({ tracingCableId: cableId, isLoading: true, error: null });
    const r = await loadProjection(cableId);
    if (!r.ok) { set({ isLoading: false, error: r.error }); return; }
    set({ projection: r.projection, isLoading: false, modalOpen: true });
  },

  openTopology: () => set({ modalOpen: true }),
  closeTopology: () => set({ modalOpen: false }),

  clearHighlight: () => set(idleState()),
}));
