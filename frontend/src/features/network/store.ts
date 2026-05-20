/**
 * Network topology store — 변전소망 그래프 (변전소 = 노드, FiberPath = edge).
 *
 * cable trace (pathHighlightStore) 와 *완전 분리* — 같은 source 의 fiberPaths 만 공유.
 * "상세" 버튼 진입점이 cable card / OFD 포트 grid 양쪽에서 같은 모달을 연다.
 *
 * Git-like 호환: backend saved + frontend pending/deleted/temp overlay (mergeWithLocal).
 */

import { create } from 'zustand';
import { api } from '../../utils/api';
import { useEditorStore } from '../editor/stores/editorStore';
import { detectRings } from '../../utils/graph/cycleDetection';
import type { FiberPathDetail } from '../fiber/types';
import type { TraceNode, TraceEdge, TraceRing } from '../pathTrace/types';

/** 변전소 단위 노드 (React Flow 의 node 컴포넌트가 받는 데이터) */
export interface NetworkSubstation {
  /** 변전소 식별자 — substationId 가 없으면 substationName 을 키로 (시드 데이터 호환) */
  id: string;
  name: string;
  /** 이 변전소의 OFD (현재 모델은 변전소당 OFD 1개를 가정) */
  ofdId: string;
  ofdName: string;
  /** OFD 의 port 들에 꽂힌 모듈 요약 — 변전소 박스 안 leaf */
  modules: { id: string; name: string }[];
  floorId: string | null;
}

/** FiberPath edge — 두 변전소 사이 광케이블 */
export interface NetworkFiberPath {
  id: string;
  ofdAId: string;
  ofdBId: string;
  substationAName: string;
  substationBName: string;
  portCount: number;
  usedPortCount: number;
}

export interface NetworkGraph {
  substations: NetworkSubstation[];
  fiberPaths: NetworkFiberPath[];
  /** cycleDetection 결과 — OFD id 기준 (FiberPath edge 의 ofdAId/ofdBId 와 동일 ID space) */
  rings: TraceRing[];
}

interface State {
  /** Backend saved (raw) — fetch 결과 캐시. cable trace 도 같은 source 사용. */
  savedFiberPaths: FiberPathDetail[] | null;
  /** Merged graph (saved + pending - deleted, cycleDetection 적용) */
  graph: NetworkGraph | null;
  isLoading: boolean;
  error: string | null;
  modalOpen: boolean;
  /** 모달 열 때 강조할 FiberPath (cable card "상세" 진입 시 seed 의 fiberPathId) */
  highlightedFiberPathId: string | null;

  /** "상세" 버튼 또는 외부 호출. seedFiberPathId 가 있으면 해당 FP+ring 강조. */
  loadAndOpen: (seedFiberPathId?: string | null) => Promise<void>;
  close: () => void;
}

export const useNetworkTopologyStore = create<State>((set) => ({
  savedFiberPaths: null,
  graph: null,
  isLoading: false,
  error: null,
  modalOpen: false,
  highlightedFiberPathId: null,

  loadAndOpen: async (seedFiberPathId) => {
    set({ isLoading: true, error: null, modalOpen: true, highlightedFiberPathId: seedFiberPathId ?? null });
    try {
      const { data } = await api.get<{ data: FiberPathDetail[] }>('/fiber-paths');
      const savedFiberPaths = data.data;
      const graph = buildGraph(savedFiberPaths);
      set({ savedFiberPaths, graph, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : '네트워크 토폴로지 로드 실패';
      set({ isLoading: false, error: message });
    }
  },

  close: () => set({ modalOpen: false, highlightedFiberPathId: null }),
}));

/**
 * saved fiberPaths + editorStore 의 pending/deleted/temp 를 merge 하고 그래프를 빌드.
 * unsaved local 변경도 즉시 토폴로지에 반영 (git-like).
 */
function buildGraph(savedFiberPaths: FiberPathDetail[]): NetworkGraph {
  const ed = useEditorStore.getState();
  const deletedFps = new Set(ed.deletedFiberPathIds);

  // 1. FiberPath list (saved - deleted + pending)
  const activeSaved = savedFiberPaths.filter((fp) => !deletedFps.has(fp.id));

  /**
   * Pending FiberPath 는 ofdA/ofdB 가 *equipment ref* 로만. saved 와 같은 FiberPathDetail
   * shape 으로 변환 — ports[] 는 미생성 (아직 cable 안 꽂힘) 이라 빈 배열.
   */
  const equipMap = new Map(ed.localEquipment.map((e) => [e.id, e]));
  const pendingFps: FiberPathDetail[] = ed.pendingFiberPaths.map((fp) => {
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

  const allFps = [...activeSaved, ...pendingFps];

  // 2. Substation 단위로 그룹핑 (변전소당 OFD 1개 가정. 시드 데이터 호환.)
  const substationMap = new Map<string, NetworkSubstation>();

  function addOfdAsSubstation(ofd: FiberPathDetail['ofdA']) {
    const key = ofd.substationName || ofd.id; // substationName 빈 문자열 (temp OFD) 면 id 로
    if (substationMap.has(key)) return;
    substationMap.set(key, {
      id: key,
      name: ofd.substationName || ofd.name,
      ofdId: ofd.id,
      ofdName: ofd.name,
      modules: [], // 아래에서 채움 (ports[].sideA/B 의 equipmentName 중복 제거)
      floorId: ofd.floorId,
    });
  }

  for (const fp of allFps) {
    addOfdAsSubstation(fp.ofdA);
    addOfdAsSubstation(fp.ofdB);
  }

  // 3. 각 OFD 의 모듈 leaf — fiberPath.ports[].sideX.equipmentName 중복제거
  //   (saved fiberPaths 에는 ports 가 채워져 있고, pending 은 빈 배열이므로 무시됨)
  for (const fp of allFps) {
    for (const port of fp.ports) {
      const a = fp.ofdA;
      const b = fp.ofdB;
      if (port.sideA) {
        const key = a.substationName || a.id;
        const sub = substationMap.get(key);
        if (sub && !sub.modules.find((m) => m.id === port.sideA!.equipmentId)) {
          sub.modules.push({ id: port.sideA.equipmentId, name: port.sideA.equipmentName });
        }
      }
      if (port.sideB) {
        const key = b.substationName || b.id;
        const sub = substationMap.get(key);
        if (sub && !sub.modules.find((m) => m.id === port.sideB!.equipmentId)) {
          sub.modules.push({ id: port.sideB.equipmentId, name: port.sideB.equipmentName });
        }
      }
    }
  }

  const substations = Array.from(substationMap.values());

  // 4. FiberPath edge list (사용 포트 수 계산)
  const fiberPaths: NetworkFiberPath[] = allFps.map((fp) => {
    let used = 0;
    for (const p of fp.ports) if (p.sideA || p.sideB) used++;
    return {
      id: fp.id,
      ofdAId: fp.ofdA.id,
      ofdBId: fp.ofdB.id,
      substationAName: fp.ofdA.substationName || fp.ofdA.name,
      substationBName: fp.ofdB.substationName || fp.ofdB.name,
      portCount: fp.portCount,
      usedPortCount: used,
    };
  });

  // 5. Ring detection — OFD id space.
  //    cycleDetection 은 TraceNode/TraceEdge shape 을 요구하므로 변환.
  const nodeMap = new Map<string, TraceNode>();
  for (const sub of substations) {
    nodeMap.set(sub.ofdId, {
      equipmentId: sub.ofdId,
      equipmentName: sub.ofdName,
      substationId: sub.id,
      substationName: sub.name,
      floorId: sub.floorId,
      materialCategoryCode: 'EQP-OFD',
      isSource: false,
      isTarget: false,
    });
  }
  const edgeMap = new Map<string, TraceEdge>();
  const adjacency = new Map<string, Set<string>>();
  for (const fp of fiberPaths) {
    const edge: TraceEdge = {
      id: fp.id,
      sourceEquipmentId: fp.ofdAId,
      targetEquipmentId: fp.ofdBId,
      type: 'fiberPath',
      cableType: 'FIBER',
      fiberPathId: fp.id,
      fiberPathLabel: `${fp.substationAName}-${fp.substationBName}`,
      portCount: fp.portCount,
    };
    edgeMap.set(fp.id, edge);
    if (!adjacency.has(fp.ofdAId)) adjacency.set(fp.ofdAId, new Set());
    if (!adjacency.has(fp.ofdBId)) adjacency.set(fp.ofdBId, new Set());
    adjacency.get(fp.ofdAId)!.add(fp.ofdBId);
    adjacency.get(fp.ofdBId)!.add(fp.ofdAId);
  }
  const rings = detectRings(adjacency, edgeMap, nodeMap);

  return { substations, fiberPaths, rings };
}
