/**
 * Cable trace — 한 cable 시드에서 시작해 같은 cableType cable 들을 따라가며
 * 도달 가능한 모든 endpoint 와 cable 을 모은다. OFD 의 경우 FiberPath 를 통해
 * 반대편 OFD 로 hop (port-isolated). 결과는 캔버스 하이라이트, 경로 상세 텍스트,
 * 그리고 ring 인식(공유 cycleDetection 호출)에 사용된다.
 *
 * 책임 분리:
 *   - 이 파일: BFS path traversal + segments
 *   - utils/graph/cycleDetection: ring detection (공유 모듈, network topology 도 사용)
 *
 * 외부 네트워크망 시각화는 별도 흐름 (features/network) — 이 함수에 ring topology
 * 책임을 욱여넣지 않는다.
 */

import type { LocalCable } from '../features/editor/stores/editorStore';
import type { FloorPlanEquipment } from '../types/floorPlan';
import type { Asset } from '../types/asset';
import type { FiberPathDetail } from '../features/fiber/types';
import type {
  TraceResult,
  TraceNode,
  TraceEdge,
  PathSegment,
  SegmentNode,
} from '../features/pathTrace/types';
import { detectRings } from './graph/cycleDetection';

export type { TraceResult };

/** TraceNode.materialCategoryCode 의 OFD 값 — P6 의 EquipmentKind.OFD 와 의미 동일 (legacy 형식). */
const OFD_CATEGORY_CODE = 'EQP-OFD';

/**
 * 단계4a — 분전 분기(BRANCH) asset id 의 표시 라벨을 parent 체인으로 해소한다.
 * 컨테인먼트는 branch → feeder → panel. 라벨은 "panel · feeder/branch" 로,
 * panel 을 못 찾으면 "feeder/branch", feeder 도 못 찾으면 branch 이름만.
 *
 * 이 asset 이 분전 분기 계층이 아니면(=parent 가 도면 배치 설비이거나 없음) null 을
 * 돌려 호출측이 일반(설비/모듈/external) 라벨 경로로 빠지게 한다. 판정은 "parent 도
 * 좌표 없는 내부 asset 인가" — branch(parent=feeder, 그 parent=panel)만 두 단계
 * 부모가 모두 assetMap 안에 있고 panel 이 도면 배치(floorId)인 형태로 성립한다.
 */
function branchAssetLabel(assetId: string, assetMap: Map<string, Asset>): string | null {
  const branch = assetMap.get(assetId);
  if (!branch || branch.parentAssetId == null) return null;
  const feeder = assetMap.get(branch.parentAssetId);
  // feeder 는 panel 안의 내부 asset(부모가 또 있음). 부모가 없으면 분기 계층 아님.
  if (!feeder || feeder.parentAssetId == null) return null;
  const panel = assetMap.get(feeder.parentAssetId);
  const stem = `${feeder.name}/${branch.name}`;
  return panel ? `${panel.name} · ${stem}` : stem;
}

// ==================== Segment Builder ====================

/**
 * Build path segments using iterative DFS.
 *
 * - Follows the longest linear path first (higher-degree neighbors preferred)
 * - Branch points queue extra neighbors as pending branches
 * - Each branch segment starts with the branch-point node (shows the fork)
 */
function buildPathSegments(nodes: TraceNode[], edges: TraceEdge[]): PathSegment[] {
  if (nodes.length === 0) return [];
  if (edges.length === 0)
    return nodes.map((n) => ({
      nodes: [{ nodeId: n.nodeId, edgeId: null }],
      branchPointId: null,
    }));

  // Build undirected adjacency
  const adj = new Map<string, { neighborId: string; edgeId: string }[]>();
  for (const n of nodes) adj.set(n.nodeId, []);
  for (const e of edges) {
    adj.get(e.sourceAssetId)?.push({ neighborId: e.targetAssetId, edgeId: e.id });
    adj.get(e.targetAssetId)?.push({ neighborId: e.sourceAssetId, edgeId: e.id });
  }

  // Precompute degrees
  const degreeMap = new Map<string, number>();
  for (const [id, neighbors] of adj) degreeMap.set(id, neighbors.length);
  const degree = (id: string) => degreeMap.get(id) ?? 0;

  // Pick start: prefer degree-1 leaf with isSource, then any leaf, then isSource
  const leaves = nodes.filter((n) => degree(n.nodeId) === 1);
  const startNode =
    leaves.find((n) => n.isSource) ??
    leaves[0] ??
    nodes.find((n) => n.isSource) ??
    nodes[0];

  const segments: PathSegment[] = [];
  const visited = new Set<string>();
  const pending: { branchNodeId: string; edgeId: string; neighborId: string }[] = [];

  function walkSegment(segStart: SegmentNode[], branchPointId: string | null) {
    const seg: SegmentNode[] = [...segStart];
    let currentId = seg[seg.length - 1].nodeId;

    for (;;) {
      const unvisited = (adj.get(currentId) ?? [])
        .filter((n) => !visited.has(n.neighborId))
        .sort((a, b) => degree(b.neighborId) - degree(a.neighborId));

      if (unvisited.length === 0) break;

      const first = unvisited[0];
      visited.add(first.neighborId);
      seg.push({ nodeId: first.neighborId, edgeId: first.edgeId });

      for (let i = 1; i < unvisited.length; i++) {
        pending.push({
          branchNodeId: currentId,
          edgeId: unvisited[i].edgeId,
          neighborId: unvisited[i].neighborId,
        });
      }

      currentId = first.neighborId;
    }

    segments.push({ nodes: seg, branchPointId });
  }

  visited.add(startNode.nodeId);
  walkSegment([{ nodeId: startNode.nodeId, edgeId: null }], null);

  while (pending.length > 0) {
    const branch = pending.pop()!;
    if (visited.has(branch.neighborId)) continue;
    visited.add(branch.neighborId);
    walkSegment(
      [
        { nodeId: branch.branchNodeId, edgeId: null },
        { nodeId: branch.neighborId, edgeId: branch.edgeId },
      ],
      branch.branchNodeId,
    );
  }

  // Safety: disconnected nodes
  for (const n of nodes) {
    if (!visited.has(n.nodeId)) {
      segments.push({ nodes: [{ nodeId: n.nodeId, edgeId: null }], branchPointId: null });
    }
  }

  return segments;
}

// ==================== Main Trace Function ====================

export interface TraceCableInput {
  /** The cable to trace from */
  cableId: string;
  /** All cables (local state) */
  cables: LocalCable[];
  /** All equipment (local state) */
  equipment: FloorPlanEquipment[];
  /** Rack modules (local state, RACK 자식 Asset) — endpoint id 가 모듈 id 일 때 이름 lookup 용 */
  rackModules?: Asset[];
  /**
   * Effective assets (local state) — endpoint id 가 분전 분기(BRANCH) asset 일 때
   * 라벨을 "분전반 · feeder/branch" 로 해소하기 위한 parent 체인 lookup 용.
   */
  assets?: Asset[];
  /** Fiber paths (saved + pending, merged) — OFD↔OFD hop 시 port-isolated 라우팅에 사용 */
  fiberPaths: FiberPathDetail[];
}

/**
 * Trace all connected equipment from a given cable using BFS.
 * Follows only cables of the same cableType.
 * For FIBER: traverses FiberPaths at OFDs with port isolation
 * (한 cable 의 (fpId, portN) 에서 시작해 같은 portN 의 반대편 endpoint 로만 hop).
 *
 * Runs entirely in-browser on local data.
 */
export function traceCable(input: TraceCableInput): TraceResult {
  const { cableId, cables, equipment, rackModules, assets, fiberPaths } = input;

  // Lookups (현재 floor 한정)
  const equipMap = new Map(equipment.map((e) => [e.id, e]));
  const moduleMap = new Map((rackModules ?? []).map((m) => [m.id, m]));
  // 단계4a — 분전 분기는 BRANCH asset. endpoint id 가 BRANCH asset 이면 parent 체인
  //   (branch→feeder→panel) 을 걸어 "분전반 · feeder/branch" 라벨을 만든다.
  const assetMap = new Map((assets ?? []).map((a) => [a.id, a]));

  // fiberPaths 응답은 모든 변전소의 OFD/모듈 이름·변전소명 정보를 갖고 있어
  // cross-floor lookup 용 source of truth. equipMap/moduleMap 에 없는 원격 노드는
  // 이걸로 채움. (ofdA/B = OFD, ports[].sideX = 그 OFD 에 꽂힌 모듈)
  type ExternalInfo = { name: string; substationName: string; isOfd: boolean };
  const externalInfo = new Map<string, ExternalInfo>();
  for (const fp of fiberPaths) {
    externalInfo.set(fp.ofdA.id, { name: fp.ofdA.name, substationName: fp.ofdA.substationName, isOfd: true });
    externalInfo.set(fp.ofdB.id, { name: fp.ofdB.name, substationName: fp.ofdB.substationName, isOfd: true });
    for (const port of fp.ports) {
      if (port.sideA) {
        externalInfo.set(port.sideA.assetId, {
          name: port.sideA.assetName,
          substationName: fp.ofdA.substationName,
          isOfd: false,
        });
      }
      if (port.sideB) {
        externalInfo.set(port.sideB.assetId, {
          name: port.sideB.assetName,
          substationName: fp.ofdB.substationName,
          isOfd: false,
        });
      }
    }
  }

  // 1. Find the starting cable
  const startCable = cables.find((c) => c.id === cableId);
  if (!startCable) {
    return { nodes: [], edges: [], rings: [], segments: [] };
  }

  const cableType = startCable.cableType;
  const sourceId = startCable.sourceAssetId;
  const targetId = startCable.targetAssetId;

  // Node and edge maps
  const nodeMap = new Map<string, TraceNode>();
  const edgeMap = new Map<string, TraceEdge>();
  const adjacency = new Map<string, Set<string>>();

  // substationId 자리에 substationName 을 두 번 채움 — 토폴로지의 그룹핑 key 가 substationName
  // 이고 frontend 에 실제 substationId 가 없는 한 동일 값으로 통일 (NetworkTopologyModal 의
  // groupBySubstation 이 substationName 기준이라 layout 이 자동 정상).
  const addNode = (nodeId: string, isSource: boolean, isTarget: boolean) => {
    if (nodeMap.has(nodeId)) return;
    const ext = externalInfo.get(nodeId);
    const subName = ext?.substationName ?? '';

    const equip = equipMap.get(nodeId);
    if (equip) {
      nodeMap.set(nodeId, {
        nodeId: equip.id,
        nodeName: equip.name,
        substationId: subName,
        substationName: subName,
        floorId: null,
        materialCategoryCode: equip.materialCategoryCode ?? (ext?.isOfd ? OFD_CATEGORY_CODE : null),
        isSource,
        isTarget,
      });
      return;
    }
    const mod = moduleMap.get(nodeId);
    if (mod) {
      nodeMap.set(nodeId, {
        nodeId,
        nodeName: mod.name,
        substationId: subName,
        substationName: subName,
        floorId: null,
        materialCategoryCode: null,
        isSource,
        isTarget,
      });
      return;
    }
    const branchLabel = branchAssetLabel(nodeId, assetMap);
    if (branchLabel) {
      nodeMap.set(nodeId, {
        nodeId,
        nodeName: branchLabel,
        substationId: subName,
        substationName: subName,
        floorId: null,
        materialCategoryCode: null,
        isSource,
        isTarget,
      });
      return;
    }
    // Cross-floor lookup via externalInfo. isOfd === false → 모듈, 그 외(true 또는 undefined) → OFD.
    nodeMap.set(nodeId, {
      nodeId,
      nodeName: ext?.name ?? nodeId,
      substationId: subName,
      substationName: subName,
      floorId: null,
      materialCategoryCode: ext?.isOfd === false ? null : OFD_CATEGORY_CODE,
      isSource,
      isTarget,
    });
  };

  const addEdge = (edge: TraceEdge) => {
    if (edgeMap.has(edge.id)) return;
    edgeMap.set(edge.id, edge);
    if (!adjacency.has(edge.sourceAssetId)) {
      adjacency.set(edge.sourceAssetId, new Set());
    }
    if (!adjacency.has(edge.targetAssetId)) {
      adjacency.set(edge.targetAssetId, new Set());
    }
    adjacency.get(edge.sourceAssetId)!.add(edge.targetAssetId);
    adjacency.get(edge.targetAssetId)!.add(edge.sourceAssetId);
  };

  // 2. In-memory adjacency by cableType
  const sameCables = cables.filter((c) => c.cableType === cableType);
  const cableAdjacency = new Map<string, LocalCable[]>();
  for (const cable of sameCables) {
    if (!cableAdjacency.has(cable.sourceAssetId)) cableAdjacency.set(cable.sourceAssetId, []);
    if (!cableAdjacency.has(cable.targetAssetId)) cableAdjacency.set(cable.targetAssetId, []);
    cableAdjacency.get(cable.sourceAssetId)!.push(cable);
    cableAdjacency.get(cable.targetAssetId)!.push(cable);
  }

  // 3. OFD ids — 로컬 equipment(현재 floor) + fiberPaths.ofdA/B (모든 변전소).
  //    BFS 가 *원격* OFD 에 도달했을 때도 isOfd 분기가 true 여야 traverseFiberPaths
  //    가 호출됨. ofdA/B 는 정의상 OFD 이므로 데이터에서 정당한 추론.
  const ofdIds = new Set<string>();
  if (cableType === 'FIBER') {
    for (const eq of equipment) {
      if (eq.kind === 'OFD') ofdIds.add(eq.id);
    }
    for (const fp of fiberPaths) {
      ofdIds.add(fp.ofdA.id);
      ofdIds.add(fp.ofdB.id);
    }
  }

  // BFS state
  const visited = new Set<string>();
  const visitedEdges = new Set<string>();
  /** OFD 별 reachable port — port-isolated 라우팅. key: "fpId:portNum" */
  const ofdReachablePorts = new Map<string, Set<string>>();
  const queue: string[] = [];

  // Seed
  addNode(sourceId, true, false);
  addNode(targetId, false, true);
  addEdge({
    id: startCable.id,
    sourceAssetId: sourceId,
    targetAssetId: targetId,
    type: 'cable',
    cableType: startCable.cableType as TraceEdge['cableType'],
    label: startCable.label ?? undefined,
    length: startCable.totalLength ?? undefined,
    materialCategoryCode: startCable.categoryCode ?? undefined,
    materialCategoryName: startCable.categoryName ?? undefined,
    displayColor: startCable.displayColor ?? undefined,
  });
  visitedEdges.add(startCable.id);

  if (cableType === 'FIBER' && startCable.fiberPathId && startCable.fiberPortNumber) {
    const portKey = `${startCable.fiberPathId}:${startCable.fiberPortNumber}`;
    for (const eqId of [sourceId, targetId]) {
      if (ofdIds.has(eqId)) {
        if (!ofdReachablePorts.has(eqId)) ofdReachablePorts.set(eqId, new Set());
        ofdReachablePorts.get(eqId)!.add(portKey);
      }
    }
  }

  queue.push(sourceId, targetId);
  visited.add(sourceId);
  visited.add(targetId);

  // Fiber cable lookup by fiberPathId
  const fiberCablesByPathId = new Map<string, LocalCable[]>();
  if (cableType === 'FIBER') {
    for (const cable of sameCables) {
      if (cable.fiberPathId) {
        if (!fiberCablesByPathId.has(cable.fiberPathId)) fiberCablesByPathId.set(cable.fiberPathId, []);
        fiberCablesByPathId.get(cable.fiberPathId)!.push(cable);
      }
    }
  }

  // 4. BFS
  let qHead = 0;
  while (qHead < queue.length) {
    const nodeId = queue[qHead++]!;
    const isOfd = ofdIds.has(nodeId);

    for (const cable of cableAdjacency.get(nodeId) ?? []) {
      if (visitedEdges.has(cable.id)) continue;

      // FIBER + OFD↔OFD cable: port isolation
      if (cableType === 'FIBER' && cable.fiberPathId && cable.fiberPortNumber && isOfd) {
        const portKey = `${cable.fiberPathId}:${cable.fiberPortNumber}`;
        const otherId2 =
          cable.sourceAssetId === nodeId ? cable.targetAssetId : cable.sourceAssetId;
        if (ofdIds.has(otherId2)) {
          const reachable = ofdReachablePorts.get(nodeId);
          if (!reachable || !reachable.has(portKey)) continue;
        }
        // OFD ↔ non-OFD: always allow
      }

      visitedEdges.add(cable.id);

      addNode(cable.sourceAssetId, cable.sourceAssetId === sourceId, cable.sourceAssetId === targetId);
      addNode(cable.targetAssetId, cable.targetAssetId === sourceId, cable.targetAssetId === targetId);
      addEdge({
        id: cable.id,
        sourceAssetId: cable.sourceAssetId,
        targetAssetId: cable.targetAssetId,
        type: 'cable',
        cableType: cable.cableType as TraceEdge['cableType'],
        label: cable.label ?? undefined,
        length: cable.totalLength ?? undefined,
        materialCategoryCode: cable.categoryCode ?? undefined,
        materialCategoryName: cable.categoryName ?? undefined,
        displayColor: cable.displayColor ?? undefined,
      });

      const otherId =
        cable.sourceAssetId === nodeId ? cable.targetAssetId : cable.sourceAssetId;

      // Propagate port context across FIBER cables
      if (cableType === 'FIBER' && cable.fiberPathId && cable.fiberPortNumber) {
        const portKey = `${cable.fiberPathId}:${cable.fiberPortNumber}`;
        if (ofdIds.has(otherId)) {
          if (!ofdReachablePorts.has(otherId)) ofdReachablePorts.set(otherId, new Set());
          ofdReachablePorts.get(otherId)!.add(portKey);
        }
        if (isOfd) {
          if (!ofdReachablePorts.has(nodeId)) ofdReachablePorts.set(nodeId, new Set());
          ofdReachablePorts.get(nodeId)!.add(portKey);
        }
      }

      if (!visited.has(otherId)) {
        visited.add(otherId);
        queue.push(otherId);
      }
    }

    // FIBER OFD: traverse FiberPaths via reachable ports (port-isolated)
    if (cableType === 'FIBER' && isOfd) {
      traverseFiberPaths(
        nodeId,
        fiberPaths,
        fiberCablesByPathId,
        visited,
        visitedEdges,
        ofdReachablePorts,
        queue,
        addNode,
        addEdge,
      );
    }
  }

  // 5. Ring detection (공유 모듈)
  const nodes = Array.from(nodeMap.values());
  const edgesArr = Array.from(edgeMap.values());
  const rings = detectRings(adjacency, edgeMap, nodeMap);

  // 6. Display segments
  const segments = buildPathSegments(nodes, edgesArr);

  return { nodes, edges: edgesArr, rings, segments };
}

// ==================== Fiber Path Traversal ====================

/**
 * 이 OFD 의 reachable port 들을 통해 같은 fiberPath 의 반대편 OFD 로 hop.
 * port-isolated — 시드 cable 의 (fpId, portN) 만 따라가야 하므로 reachable port 만 처리.
 */
function traverseFiberPaths(
  ofdId: string,
  fiberPaths: FiberPathDetail[],
  fiberCablesByPathId: Map<string, LocalCable[]>,
  visited: Set<string>,
  visitedEdges: Set<string>,
  ofdReachablePorts: Map<string, Set<string>>,
  queue: string[],
  addNode: (nodeId: string, isSource: boolean, isTarget: boolean) => void,
  addEdge: (edge: TraceEdge) => void,
): void {
  const reachable = ofdReachablePorts.get(ofdId);
  if (!reachable || reachable.size === 0) return;

  const reachableFpIds = new Set([...reachable].map((k) => k.split(':')[0]));
  const relevantFps = fiberPaths.filter(
    (fp) => reachableFpIds.has(fp.id) && (fp.ofdA.id === ofdId || fp.ofdB.id === ofdId),
  );
  const fpById = new Map(relevantFps.map((fp) => [fp.id, fp]));

  // 반대편 cable lookup (이 OFD 가 endpoint 아닌 cable)
  const otherSideByKey = new Map<string, LocalCable>();
  for (const fpId of reachableFpIds) {
    const cables = fiberCablesByPathId.get(fpId);
    if (!cables) continue;
    for (const cable of cables) {
      if (
        cable.fiberPortNumber != null &&
        cable.sourceAssetId !== ofdId &&
        cable.targetAssetId !== ofdId
      ) {
        otherSideByKey.set(`${cable.fiberPathId}:${cable.fiberPortNumber}`, cable);
      }
    }
  }

  for (const portKey of reachable) {
    const [fpId, portNumStr] = portKey.split(':');
    const portNum = parseInt(portNumStr, 10);
    const edgeKey = `fp:${portKey}`;
    if (visitedEdges.has(edgeKey)) continue;
    visitedEdges.add(edgeKey);

    const otherSideCable = otherSideByKey.get(portKey);
    if (!otherSideCable) continue;

    const fp = fpById.get(fpId);
    if (!fp) continue;

    addNode(fp.ofdA.id, false, false);
    addNode(fp.ofdB.id, false, false);

    const localOfd = fp.ofdA.id === ofdId ? fp.ofdA : fp.ofdB;
    const remoteOfd = fp.ofdA.id === ofdId ? fp.ofdB : fp.ofdA;
    const fiberPathLabel = `${localOfd.substationName || localOfd.name}-${remoteOfd.substationName || remoteOfd.name}`;

    addEdge({
      id: edgeKey,
      sourceAssetId: fp.ofdA.id,
      targetAssetId: fp.ofdB.id,
      type: 'fiberPath',
      cableType: 'FIBER',
      fiberPathId: fp.id,
      fiberPathLabel,
      portCount: fp.portCount,
      fiberPortNumber: portNum,
    });

    const remoteOfdId = fp.ofdA.id === ofdId ? fp.ofdB.id : fp.ofdA.id;
    if (!ofdReachablePorts.has(remoteOfdId)) ofdReachablePorts.set(remoteOfdId, new Set());
    ofdReachablePorts.get(remoteOfdId)!.add(portKey);

    if (!visited.has(remoteOfdId)) {
      visited.add(remoteOfdId);
      queue.push(remoteOfdId);
    }
  }
}
