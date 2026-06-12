/**
 * Network topology store — 시드 장비(cable)에서 시작한 *cable trace 결과* 를
 * 그대로 시각화. 별도 graph 빌드 없음 — cableTracer 의 traceResult 가 단일 데이터.
 *
 * 핵심 통찰: 사용자가 원하는 "네트워크 토폴로지" 는 OFD-FP 단위 그래프가 아니라
 * **그 장비가 물리적으로 도달 가능한 모든 모듈/OFD/cable/FP** 이고, 그게 정확히
 * cableTracer 의 BFS 결과. ring/대링 인식도 cycleDetection 이 traceResult.rings 에
 * 채워줌. cable 삭제 등 git-like 변경도 입력 데이터 overlay 로 자연 반영.
 */

import { create } from 'zustand';
import { isRackModuleAsset } from '../workingCopy/assetClassify';
import { toMapById } from '../../utils/byId';
import { traceCable, type TraceResult } from '../../utils/cableTracer';
import { useSubstationWorkingCopy } from '../workingCopy/substationStore';
import { cableDtoToLocal, type CableDetailDTO } from '../workingCopy/cableToLocal';
import { fetchAllFiberPathsCached } from '../fiber/hooks/useFiberPaths';
import { queryClient } from '../../lib/queryClient';
import { api } from '../../utils/api';
import type { LocalCable } from '../editor/stores/editorStore';
// 공용 매퍼 — pathHighlightStore 등 기존 import 경로 호환을 위해 re-export.
export { cableDtoToLocal, type CableDetailDTO } from '../workingCopy/cableToLocal';

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

interface State {
  /** Cable trace 결과 — 모달의 단일 source. */
  traceResult: TraceResult | null;
  /** 시드 cable 의 fiberPathId — 모달이 그 edge/ring 을 강조. */
  highlightedFiberPathId: string | null;
  isLoading: boolean;
  error: string | null;
  modalOpen: boolean;

  /**
   * "상세" 클릭 등에서 호출. seedCableId 시점에 *모든 floor 의 cable + fp* 를 fetch
   * (캐시 있으면 skip) → editorStore overlay 적용 → cableTracer 호출 → traceResult set.
   */
  loadAndOpen: (seedCableId: string) => Promise<void>;
  close: () => void;
}

export const useNetworkTopologyStore = create<State>((set) => ({
  traceResult: null,
  highlightedFiberPathId: null,
  isLoading: false,
  error: null,
  modalOpen: false,

  loadAndOpen: async (seedCableId) => {
    set({ modalOpen: true, isLoading: true, error: null });
    try {
      // 1. GLOBAL(전 변전소) backend 데이터.
      //    - fiber paths: GET /fiber-paths — 양쪽 포트(ports[].sideX) + ofdA/B 가
      //      cross-substation 으로 채워진 FiberPathDetail[]. 이게 있어야 tracer 가
      //      OFD↔OFD 를 다른 변전소까지 hop. composeFiberPaths(effective) 는 이 변전소
      //      한정 + 빈 포트라 cross-substation 토폴로지가 끊긴다.
      //    - cables: GET /cables — 전 변전소 cable(nested CableDetail). 원격 OFD 의
      //      cable 도 포함되어야 tracer 가 그쪽으로 traverse 가능.
      const globalFiberPaths = await fetchAllFiberPathsCached(queryClient);
      const globalCables = (
        await queryClient.fetchQuery({
          queryKey: ['cables'],
          staleTime: 30_000,
          queryFn: async () =>
            (await api.get<{ data: CableDetailDTO[] }>('/cables')).data.data,
        })
      ).map(cableDtoToLocal);

      // 2. 이 변전소의 staged cable 변경을 글로벌 위에 오버레이 — 방금 그린 로컬 cable 도
      //    토폴로지에 보이게. effectiveCables() = 이 변전소의 saved+staged.
      const wc = useSubstationWorkingCopy.getState();
      const stagedCables = wc
        .effectiveCables()
        .map((c) => cableDtoToLocal(c as unknown as CableDetailDTO));
      const mergedCables = overlayStagedOntoGlobal(
        globalCables,
        stagedCables,
        wc.overlays.cables.deletes,
      );

      // 3. 설비/랙모듈 이름 lookup — 이 변전소 effective assets(로컬 이름). 원격 OFD/모듈
      //    이름은 globalFiberPaths 의 ofdA/B + ports[].sideX + directory 로 tracer 가 채움.
      const effAssets = wc.effectiveAssets();
      const equipment = effAssets
        .filter((a) => !isRackModuleAsset(a));
      const rackModules = effAssets
        .filter((a) => isRackModuleAsset(a));

      // cableTracer 호출 — 모든 cable 위에서 BFS. seedCable 의 ring 자연 인식.
      // 다른 변전소는 cableTracer 가 fiberPaths 의 ofdA/B + ports[].sideX 정보로 이름 채움.
      const seedCable = mergedCables.find((c) => c.id === seedCableId);
      if (!seedCable) {
        // 시드가 working copy 에서 soft-delete 됐거나 더 이상 존재하지 않음 — 빈
        // 토폴로지를 무성공으로 표시하기보다 명시적 에러로 surface.
        set({
          isLoading: false,
          error: '시드 케이블을 찾을 수 없습니다. 삭제되었거나 캐시가 갱신되지 않았을 수 있습니다.',
        });
        return;
      }
      const result = traceCable({
        cableId: seedCableId,
        cables: mergedCables,
        equipment,
        rackModules,
        fiberPaths: globalFiberPaths,
      });

      set({
        traceResult: result,
        highlightedFiberPathId: seedCable.fiberPathId ?? null,
        isLoading: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '네트워크 토폴로지 로드 실패';
      set({ isLoading: false, error: message });
    }
  },

  close: () =>
    set({ modalOpen: false, traceResult: null, highlightedFiberPathId: null }),
}));
