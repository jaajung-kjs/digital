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
import { api } from '../../utils/api';
import { useEditorStore } from '../editor/stores/editorStore';
import type { LocalCable } from '../editor/stores/editorStore';
import { traceCable, type TraceResult } from '../../utils/cableTracer';
import type { FiberPathDetail } from '../fiber/types';
import { composePendingPath } from '../fiber/pending';
import { ensureOfdDirectory } from '../fiber/hooks/useOfdDirectory';

interface State {
  /** Backend cache — startTrace 와 공유. 모달 진입 시점에 채워짐. */
  savedFiberPaths: FiberPathDetail[] | null;
  savedCables: LocalCable[] | null;
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

// ── Merge backend saved + editorStore overlay (git-like) ───────────────────
function mergeCables(saved: LocalCable[]): LocalCable[] {
  const ed = useEditorStore.getState();
  const deletedSet = new Set(ed.deletedCableIds);
  // saved 에서 deleted 제외 + editorStore 의 *현재 floor* cable 중 saved 에 없는 것 (= pending tempId) 추가
  const result = saved.filter((c) => !deletedSet.has(c.id));
  const savedIds = new Set(result.map((c) => c.id));
  for (const c of ed.localCables) {
    if (!savedIds.has(c.id)) result.push(c);
  }
  return result;
}

function mergeFiberPaths(
  saved: FiberPathDetail[],
  directory: Map<string, { id: string; name: string; substationName: string; floorId: string | null }>,
): FiberPathDetail[] {
  const ed = useEditorStore.getState();
  const deletedFps = new Set(ed.deletedFiberPathIds);
  const active = saved.filter((fp) => !deletedFps.has(fp.id));
  const pending = ed.pendingFiberPaths.map((fp) => composePendingPath(fp, directory));
  return [...active, ...pending];
}

export const useNetworkTopologyStore = create<State>((set, get) => ({
  savedFiberPaths: null,
  savedCables: null,
  traceResult: null,
  highlightedFiberPathId: null,
  isLoading: false,
  error: null,
  modalOpen: false,

  loadAndOpen: async (seedCableId) => {
    set({ modalOpen: true, isLoading: true, error: null });
    try {
      // 1. saved fetch (캐시 활용)
      let savedFiberPaths = get().savedFiberPaths;
      let savedCables = get().savedCables;
      if (!savedFiberPaths || !savedCables) {
        const [fpRes, cableRes] = await Promise.all([
          api.get<{ data: FiberPathDetail[] }>('/fiber-paths'),
          api.get<{ data: CableDetailDTO[] }>('/cables'),
        ]);
        savedFiberPaths = fpRes.data.data;
        savedCables = cableRes.data.data.map(cableDtoToLocal);
        set({ savedFiberPaths, savedCables });
      }

      // 2. editorStore overlay (pending/deleted)
      const directory = await ensureOfdDirectory();
      const mergedCables = mergeCables(savedCables);
      const mergedFps = mergeFiberPaths(savedFiberPaths, directory);

      // 3. cableTracer 호출 — 모든 cable 위에서 BFS. seedCable 의 ring 자연 인식.
      // 현재 floor 의 equipment/rackModules 만 — 다른 변전소는 cableTracer 가 fiberPaths
      // 의 ofdA/B + ports[].sideX 정보로 이름/변전소명 채움 (externalInfo lookup).
      const ed = useEditorStore.getState();
      const seedCable = mergedCables.find((c) => c.id === seedCableId);
      const result = traceCable({
        cableId: seedCableId,
        cables: mergedCables,
        equipment: ed.localEquipment,
        rackModules: ed.localRackModules,
        fiberPaths: mergedFps,
      });

      set({
        traceResult: result,
        highlightedFiberPathId: seedCable?.fiberPathId ?? null,
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
