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
import type { LocalCable } from '../editor/stores/editorStore';
import { traceCable, type TraceResult } from '../../utils/cableTracer';
import { ensureOfdDirectory } from '../fiber/hooks/useOfdDirectory';
import { useSubstationWorkingCopy } from '../workingCopy/substationStore';
import { composeFiberPaths } from '../workingCopy/merge';
import { assetToEquipment } from '../workingCopy/assetToEquipment';
import { assetToRackModule } from '../workingCopy/assetToRackModule';

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

// ── Backend CableDetail (`source.nested`) → LocalCable (`flat`) 변환 ─────────
interface CableDetailDTO {
  id: string;
  source: { equipmentId: string | null; moduleId: string | null; circuitId?: string | null; name?: string; floorId?: string | null };
  target: { equipmentId: string | null; moduleId: string | null; circuitId?: string | null; name?: string; floorId?: string | null };
  cableType: string;
  fiberPathId?: string | null;
  fiberPortNumber?: number | null;
  fiberPathDescription?: string | null;
  categoryId?: string | null;
  categoryCode?: string | null;
  categoryName?: string | null;
  displayColor?: string | null;
  label?: string | null;
  pathPoints?: [number, number][] | null;
  pathLength?: number | null;
  bufferLength?: number;
  totalLength?: number | null;
}

function cableDtoToLocal(c: CableDetailDTO): LocalCable {
  // LocalCable.sourceEquipmentId 자리는 polymorphic fallback (planCablesToLocalCables 와 동일):
  //   equipment id 우선, 없으면 module id, 없으면 circuit id, 없으면 빈 문자열.
  // cableTracer 가 이 값을 cableAdjacency 의 key 로 사용 + addNode 가 moduleMap lookup.
  return {
    id: c.id,
    sourceEquipmentId: c.source.equipmentId ?? c.source.moduleId ?? c.source.circuitId ?? '',
    targetEquipmentId: c.target.equipmentId ?? c.target.moduleId ?? c.target.circuitId ?? '',
    sourceModuleId: c.source.moduleId ?? null,
    targetModuleId: c.target.moduleId ?? null,
    sourceCircuitId: c.source.circuitId ?? null,
    targetCircuitId: c.target.circuitId ?? null,
    cableType: c.cableType,
    categoryId: c.categoryId ?? null,
    categoryCode: c.categoryCode ?? null,
    categoryName: c.categoryName ?? null,
    displayColor: c.displayColor ?? null,
    label: c.label ?? null,
    pathPoints: c.pathPoints ?? null,
    pathLength: c.pathLength ?? null,
    bufferLength: c.bufferLength,
    totalLength: c.totalLength ?? null,
    fiberPathId: c.fiberPathId ?? null,
    fiberPortNumber: c.fiberPortNumber ?? null,
    fiberPathLabel: c.fiberPathDescription ?? null,
  };
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
      // OFD directory 만 fetch — cable/fiber/equipment 는 통합 working-copy 스토어의
      // effective(saved+staged) 에서 온다. directory 는 pending/cross-substation OFD
      // 표시명 합성에 필요(2d-3a T4: editorStore overlay 제거).
      const directory = await ensureOfdDirectory();

      // 통합 스토어 effective 를 build-time 에 getState 로 읽는다 — loadAndOpen 은 모달을
      // 열 때마다 호출되는 on-demand 액션이므로 구독 불필요(매 open 마다 최신값으로 재계산).
      const wc = useSubstationWorkingCopy.getState();
      const mergedCables = wc.effectiveCables().map((c) => cableDtoToLocal(c as unknown as CableDetailDTO));
      // 통합 스토어 effective fiber paths 는 flat DB row — directory 로 표시용 합성.
      const mergedFps = composeFiberPaths(
        wc.effectiveFiberPaths() as unknown as Array<{ id: string; ofdAId: string; ofdBId: string; portCount: number; description?: string | null }>,
        directory,
      );
      // 설비/랙모듈 이름 lookup — effective assets 전체(top + 랙모듈 자식).
      const effAssets = wc.effectiveAssets();
      const equipment = effAssets
        .filter((a) => !(a.parentAssetId && a.slotIndex != null))
        .map(assetToEquipment);
      const rackModules = effAssets
        .filter((a) => a.parentAssetId && a.slotIndex != null)
        .map(assetToRackModule);

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
        fiberPaths: mergedFps,
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
