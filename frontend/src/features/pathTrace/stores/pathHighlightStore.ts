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
import type { Asset } from '../../../types/asset';
import { projectTrace, type TraceProjection } from '../../trace/traceProjection';
import { buildTraceOverlay, fetchServerTraceGraph } from '../../trace/useServerTrace';
import { queryClient } from '../../../lib/queryClient';
import { CABLE_CATEGORY_KEYS } from '../../cables/hooks/useCableCategories';
import type { CableCategory } from '../../../types/cableCategory';

/** 워킹카피 effective cable shape — group 해소용 최소 필드. */
type CableLike = {
  id: string;
  sourceAssetId?: string | null;
  targetAssetId?: string | null;
  groupId?: string | null;
  categoryId?: string | null;
};

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
 * 시드 cable 의 (seedAssetId, groupId) 해소 — 서버 trace 호출 파라미터.
 * cable 의 group 은 직접 groupId 우선, 없으면 categoryId→groupId(카테고리 카탈로그) 맵.
 */
function resolveSeedFromCable(cableId: string): { seedAssetId: string; groupId: string } | null {
  const wc = useSubstationWorkingCopy.getState();
  const cables = wc.effectiveCables() as unknown as CableLike[];
  const cable = cables.find((c) => c.id === cableId);
  if (!cable) return null;
  const seedAssetId = cable.sourceAssetId ?? cable.targetAssetId ?? null;
  if (!seedAssetId) return null;

  const categories = (queryClient.getQueryData(CABLE_CATEGORY_KEYS.all) as CableCategory[] | undefined) ?? [];
  const catToGroup = new Map(categories.map((c) => [c.id, c.groupId]));
  const groupId = cable.groupId ?? (cable.categoryId ? catToGroup.get(cable.categoryId) ?? null : null);
  if (!groupId) return null;
  return { seedAssetId, groupId };
}

/**
 * 시드 cable 1회 추적 → projection. 그래프 소스 = 서버(POST /api/trace) connected
 * component(seedAssetId+groupId), staged delta 는 overlay 로 머지. projectTrace 는
 * 그 작은 그래프 위에서 변경 없이 실행된다(전역 buildTraceGraph 의존 제거).
 */
async function loadProjection(cableId: string): Promise<
  | { ok: true; projection: TraceProjection }
  | { ok: false; error: string }
> {
  try {
    const seed = resolveSeedFromCable(cableId);
    if (!seed) {
      return { ok: false, error: '시드 케이블을 찾을 수 없습니다. 삭제되었거나 캐시가 갱신되지 않았을 수 있습니다.' };
    }
    const wc = useSubstationWorkingCopy.getState();
    const overlay = buildTraceOverlay({ cables: wc.overlays.cables, assets: wc.overlays.assets });
    const graph = await fetchServerTraceGraph(seed.seedAssetId, seed.groupId, overlay);
    const projection = projectTrace(cableId, graph);
    if (!projection) {
      return { ok: false, error: '시드 케이블을 찾을 수 없습니다. 삭제되었거나 캐시가 갱신되지 않았을 수 있습니다.' };
    }
    return { ok: true, projection };
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

export const usePathHighlightStore = create<PathHighlightState>((set, get) => ({
  ...idleState(),

  // 토폴로지 모달은 독립 라이프사이클(prepareTopology 가 열고 closeTopology 가 닫음)이므로
  // setHighlight 는 projection/modalOpen 을 의도적으로 건드리지 않는다(선택 변경이 방금 연 모달을 닫지 않도록).
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
    // await 중 다른 연결이 선택되었으면(tracingCableId 변경) 이 결과는 버린다(stale).
    if (get().tracingCableId !== cableId) return;
    if (!r.ok) { set({ isLoading: false, tracingCableId: null, error: r.error }); return; }
    set({ projection: r.projection, isLoading: false, modalOpen: true });
  },

  openTopology: () => set({ modalOpen: true }),
  closeTopology: () => set({ modalOpen: false }),

  clearHighlight: () => set(idleState()),
}));
