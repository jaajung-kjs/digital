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
import type { FloorPlanEquipment } from '../../types/floorPlan';
import type { RackModule } from '../../types/rackModule';

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

function mergeFiberPaths(saved: FiberPathDetail[]): FiberPathDetail[] {
  const ed = useEditorStore.getState();
  const deletedFps = new Set(ed.deletedFiberPathIds);
  const equipMap = new Map(ed.localEquipment.map((e) => [e.id, e]));
  const active = saved.filter((fp) => !deletedFps.has(fp.id));
  const pending: FiberPathDetail[] = ed.pendingFiberPaths.map((fp) => {
    const ofdA = equipMap.get(fp.ofdAId);
    const ofdB = equipMap.get(fp.ofdBId);
    return {
      id: fp.id,
      ofdA: { id: fp.ofdAId, name: ofdA?.name ?? '?', substationName: '', floorId: null },
      ofdB: { id: fp.ofdBId, name: ofdB?.name ?? '?', substationName: '', floorId: null },
      portCount: fp.portCount,
      description: fp.description ?? null,
      ports: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as FiberPathDetail;
  });
  return [...active, ...pending];
}

/**
 * 모든 OFD/모듈/회로의 union — cableTracer 의 equipment/rackModules 인자.
 * saved 응답엔 다른 floor 의 equipment/module 이 없으므로 *cable 의 endpoint 메타* 에서
 * 노드 정보를 ad-hoc 으로 추출하는 게 부족함. cableTracer 의 addNode 가 equipMap/moduleMap
 * 에서 못 찾으면 minimal node 로 들어가는데, fiber-paths API 의 ofdA/B + ports[].sideX 가
 * substationName/equipmentName 을 제공 → traverseFiberPaths 에서 fallback 으로 활용됨.
 *
 * 단순화를 위해 cableTracer 가 받는 equipment/rackModules 는 *현재 floor 만* 전달.
 * 다른 변전소 OFD/모듈은 cableTracer 가 minimal node 로 처리 — name 은 fiber-paths 응답 정보로.
 *
 * (큰 시스템 확장 시 backend GET /api/equipment, /api/rack-modules 같은 list endpoint 추가 가능.)
 */
function gatherEquipmentForTrace(): { equipment: FloorPlanEquipment[]; rackModules: RackModule[] } {
  const ed = useEditorStore.getState();
  return {
    equipment: ed.localEquipment,
    rackModules: ed.localRackModules,
  };
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
      const mergedCables = mergeCables(savedCables);
      const mergedFps = mergeFiberPaths(savedFiberPaths);

      // 3. cableTracer 호출 — 모든 cable 위에서 BFS. seedCable 의 ring 자연 인식.
      const { equipment, rackModules } = gatherEquipmentForTrace();
      const seedCable = mergedCables.find((c) => c.id === seedCableId);
      const result = traceCable({
        cableId: seedCableId,
        cables: mergedCables,
        equipment,
        rackModules,
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
