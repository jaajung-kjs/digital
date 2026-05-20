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
import type { RackModule } from '../types/rackModule';
import { type DistributionCircuit, circuitLabel } from '../types/distributionCircuit';
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

// ==================== Helpers ====================

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
      nodes: [{ nodeId: n.equipmentId, edgeId: null }],
      branchPointId: null,
    }));

  // Build undirected adjacency
  const adj = new Map<string, { neighborId: string; edgeId: string }[]>();
  for (const n of nodes) adj.set(n.equipmentId, []);
  for (const e of edges) {
    adj.get(e.sourceEquipmentId)?.push({ neighborId: e.targetEquipmentId, edgeId: e.id });
    adj.get(e.targetEquipmentId)?.push({ neighborId: e.sourceEquipmentId, edgeId: e.id });
  }

  // Precompute degrees
  const degreeMap = new Map<string, number>();
  for (const [id, neighbors] of adj) degreeMap.set(id, neighbors.length);
  const degree = (id: string) => degreeMap.get(id) ?? 0;

  // Pick start: prefer degree-1 leaf with isSource, then any leaf, then isSource
  const leaves = nodes.filter((n) => degree(n.equipmentId) === 1);
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

  visited.add(startNode.equipmentId);
  walkSegment([{ nodeId: startNode.equipmentId, edgeId: null }], null);

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
    if (!visited.has(n.equipmentId)) {
      segments.push({ nodes: [{ nodeId: n.equipmentId, edgeId: null }], branchPointId: null });
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
  /** Rack modules (local state) — endpoint id 가 모듈 id 일 때 이름 lookup 용 */
  rackModules?: RackModule[];
  /** 분전반 회로 (local state) — endpoint id 가 회로 id 일 때 이름 lookup 용 */
  distributionCircuits?: DistributionCircuit[];
  /** Fiber paths (saved + pending, merged) — OFD↔OFD hop 시 port-isolated 라우팅에 사용 */
  fiberPaths: FiberPathDetail[];
  /** Floor context for substationId/Name (optional) */
  roomContext?: {
    floorId: string;
    substationId?: string;
    substationName?: string;
  };
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
  const { cableId, cables, equipment, rackModules, distributionCircuits, fiberPaths, roomContext } = input;

  // Default substation context — externalInfo 가 없을 때 fallback.
  const substationName = roomContext?.substationName ?? '';
  const defaultRoomId = roomContext?.floorId ?? null;

  // Lookups
  const equipMap = new Map(equipment.map((e) => [e.id, e]));
  const moduleMap = new Map((rackModules ?? []).map((m) => [m.id, m]));
  const circuitMap = new Map((distributionCircuits ?? []).map((c) => [c.id, c]));

  // fiberPaths 응답이 *모든 변전소 의 OFD/모듈 이름·변전소명* 정보를 이미 갖고 있다.
  // (ofdA/B.name + substationName, ports[].sideX.equipmentName)
  // 현재 floor 의 equipMap/moduleMap 에 없는 noded (다른 변전소) 도 이걸로 이름 채움.
  // Map: equipmentId → { name, substationName, isOfd }
  type ExternalInfo = { name: string; substationName: string; isOfd: boolean };
  const externalInfo = new Map<string, ExternalInfo>();
  for (const fp of fiberPaths) {
    externalInfo.set(fp.ofdA.id, { name: fp.ofdA.name, substationName: fp.ofdA.substationName, isOfd: true });
    externalInfo.set(fp.ofdB.id, { name: fp.ofdB.name, substationName: fp.ofdB.substationName, isOfd: true });
    for (const port of fp.ports) {
      if (port.sideA) {
        externalInfo.set(port.sideA.equipmentId, {
          name: port.sideA.equipmentName,
          substationName: fp.ofdA.substationName,
          isOfd: false,
        });
      }
      if (port.sideB) {
        externalInfo.set(port.sideB.equipmentId, {
          name: port.sideB.equipmentName,
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
  const sourceId = startCable.sourceEquipmentId;
  const targetId = startCable.targetEquipmentId;

  // Node and edge maps
  const nodeMap = new Map<string, TraceNode>();
  const edgeMap = new Map<string, TraceEdge>();
  const adjacency = new Map<string, Set<string>>();

  const addNode = (equipId: string, isSource: boolean, isTarget: boolean) => {
    if (nodeMap.has(equipId)) return;
    const ext = externalInfo.get(equipId); // fiberPaths 응답에서 알아낸 정확한 이름/변전소명
    const subName = ext?.substationName || substationName;

    const equip = equipMap.get(equipId);
    if (equip) {
      // 로컬 equipment 정상 분기. roomContext 가 비었어도 ext 가 채움.
      nodeMap.set(equipId, {
        equipmentId: equip.id,
        equipmentName: equip.name,
        substationId: subName, // substationId 자리에 substationName 사용 — layout 그룹 key
        substationName: subName,
        floorId: defaultRoomId,
        materialCategoryCode: equip.materialCategoryCode ?? (ext?.isOfd ? 'EQP-OFD' : null),
        isSource,
        isTarget,
      });
      return;
    }
    const mod = moduleMap.get(equipId);
    if (mod) {
      // 모듈 — 부모 랙이 현재 floor 에 있으면 substationName 채움.
      const parentRack = equipMap.get(mod.rackEquipmentId);
      nodeMap.set(equipId, {
        equipmentId: equipId,
        equipmentName: mod.name,
        substationId: parentRack ? subName : (ext?.substationName ?? ''),
        substationName: parentRack ? subName : (ext?.substationName ?? ''),
        floorId: parentRack ? defaultRoomId : null,
        materialCategoryCode: null,
        isSource,
        isTarget,
      });
      return;
    }
    const circuit = circuitMap.get(equipId);
    if (circuit) {
      const parentDist = equipMap.get(circuit.distributionEquipmentId);
      nodeMap.set(equipId, {
        equipmentId: equipId,
        equipmentName: parentDist
          ? `${parentDist.name} · ${circuitLabel(circuit)}`
          : circuitLabel(circuit),
        substationId: parentDist ? subName : '',
        substationName: parentDist ? subName : '',
        floorId: parentDist ? defaultRoomId : null,
        materialCategoryCode: null,
        isSource,
        isTarget,
      });
      return;
    }
    // Equipment 가 로컬에 없음 (다른 변전소 OFD/모듈). fiberPaths 정보로 채움.
    nodeMap.set(equipId, {
      equipmentId: equipId,
      equipmentName: ext?.name ?? equipId,
      substationId: ext?.substationName ?? '',
      substationName: ext?.substationName ?? '',
      floorId: null,
      materialCategoryCode: ext?.isOfd === false ? null : 'EQP-OFD',
      isSource,
      isTarget,
    });
  };

  const addEdge = (edge: TraceEdge) => {
    if (edgeMap.has(edge.id)) return;
    edgeMap.set(edge.id, edge);
    if (!adjacency.has(edge.sourceEquipmentId)) {
      adjacency.set(edge.sourceEquipmentId, new Set());
    }
    if (!adjacency.has(edge.targetEquipmentId)) {
      adjacency.set(edge.targetEquipmentId, new Set());
    }
    adjacency.get(edge.sourceEquipmentId)!.add(edge.targetEquipmentId);
    adjacency.get(edge.targetEquipmentId)!.add(edge.sourceEquipmentId);
  };

  // 2. In-memory adjacency by cableType
  const sameCables = cables.filter((c) => c.cableType === cableType);
  const cableAdjacency = new Map<string, LocalCable[]>();
  for (const cable of sameCables) {
    if (!cableAdjacency.has(cable.sourceEquipmentId)) cableAdjacency.set(cable.sourceEquipmentId, []);
    if (!cableAdjacency.has(cable.targetEquipmentId)) cableAdjacency.set(cable.targetEquipmentId, []);
    cableAdjacency.get(cable.sourceEquipmentId)!.push(cable);
    cableAdjacency.get(cable.targetEquipmentId)!.push(cable);
  }

  // 3. OFD ids (P6 이후 정식 식별자: kind === 'OFD')
  const ofdIds = new Set<string>();
  if (cableType === 'FIBER') {
    for (const eq of equipment) {
      if (eq.kind === 'OFD') ofdIds.add(eq.id);
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
    sourceEquipmentId: sourceId,
    targetEquipmentId: targetId,
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
    const equipId = queue[qHead++]!;
    const isOfd = ofdIds.has(equipId);

    for (const cable of cableAdjacency.get(equipId) ?? []) {
      if (visitedEdges.has(cable.id)) continue;

      // FIBER + OFD↔OFD cable: port isolation
      if (cableType === 'FIBER' && cable.fiberPathId && cable.fiberPortNumber && isOfd) {
        const portKey = `${cable.fiberPathId}:${cable.fiberPortNumber}`;
        const otherId2 =
          cable.sourceEquipmentId === equipId ? cable.targetEquipmentId : cable.sourceEquipmentId;
        if (ofdIds.has(otherId2)) {
          const reachable = ofdReachablePorts.get(equipId);
          if (!reachable || !reachable.has(portKey)) continue;
        }
        // OFD ↔ non-OFD: always allow
      }

      visitedEdges.add(cable.id);

      addNode(cable.sourceEquipmentId, cable.sourceEquipmentId === sourceId, cable.sourceEquipmentId === targetId);
      addNode(cable.targetEquipmentId, cable.targetEquipmentId === sourceId, cable.targetEquipmentId === targetId);
      addEdge({
        id: cable.id,
        sourceEquipmentId: cable.sourceEquipmentId,
        targetEquipmentId: cable.targetEquipmentId,
        type: 'cable',
        cableType: cable.cableType as TraceEdge['cableType'],
        label: cable.label ?? undefined,
        length: cable.totalLength ?? undefined,
        materialCategoryCode: cable.categoryCode ?? undefined,
        materialCategoryName: cable.categoryName ?? undefined,
        displayColor: cable.displayColor ?? undefined,
      });

      const otherId =
        cable.sourceEquipmentId === equipId ? cable.targetEquipmentId : cable.sourceEquipmentId;

      // Propagate port context across FIBER cables
      if (cableType === 'FIBER' && cable.fiberPathId && cable.fiberPortNumber) {
        const portKey = `${cable.fiberPathId}:${cable.fiberPortNumber}`;
        if (ofdIds.has(otherId)) {
          if (!ofdReachablePorts.has(otherId)) ofdReachablePorts.set(otherId, new Set());
          ofdReachablePorts.get(otherId)!.add(portKey);
        }
        if (isOfd) {
          if (!ofdReachablePorts.has(equipId)) ofdReachablePorts.set(equipId, new Set());
          ofdReachablePorts.get(equipId)!.add(portKey);
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
        equipId,
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
  addNode: (equipId: string, isSource: boolean, isTarget: boolean) => void,
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
        cable.sourceEquipmentId !== ofdId &&
        cable.targetEquipmentId !== ofdId
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
      sourceEquipmentId: fp.ofdA.id,
      targetEquipmentId: fp.ofdB.id,
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
