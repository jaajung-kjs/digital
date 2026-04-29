/**
 * Client-side cable trace utility.
 *
 * Ported from backend/src/services/cableTrace.service.ts.
 * Operates on local in-memory data (localCables + localEquipment)
 * instead of Prisma queries.
 */

import type { LocalCable } from '../features/editor/stores/editorStore';
import type { FloorPlanEquipment } from '../types/floorPlan';
import type { FiberPathDetail } from '../features/fiber/types';
import type {
  TraceResult,
  TraceNode,
  TraceEdge,
  TraceRing,
  PathSegment,
  SegmentNode,
} from '../features/pathTrace/types';

// Re-export types for convenience
export type { TraceResult };

// ==================== Helpers ====================

/** Canonical key for a node pair (order-independent) */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}\0${b}` : `${b}\0${a}`;
}

function toTraceNode(
  equip: FloorPlanEquipment,
  isSource: boolean,
  isTarget: boolean,
  substationId: string,
  substationName: string,
  floorId: string | null,
): TraceNode {
  return {
    equipmentId: equip.id,
    equipmentName: equip.name,
    substationId,
    substationName,
    floorId,
    materialCategoryCode: equip.materialCategoryCode ?? null,
    isSource,
    isTarget,
  };
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

// ==================== Ring Detection ====================

/**
 * Detect rings using fundamental cycle basis algorithm.
 *
 * 1. Build BFS spanning tree -> identify chords (non-tree edges)
 * 2. Each chord produces one fundamental cycle (소링) via LCA
 * 3. Fundamental cycles sharing edges are grouped (Union-Find)
 * 4. Groups with 2+ cycles get a composite ring (대링) via edge XOR
 */
function detectRings(
  adjacency: Map<string, Set<string>>,
  edgeMap: Map<string, TraceEdge>,
  nodeMap: Map<string, TraceNode>,
): TraceRing[] {
  if (edgeMap.size === 0) return [];

  // 1. Pair -> edgeIds lookup (supports parallel edges)
  const pairToEdgeIds = new Map<string, string[]>();
  for (const [edgeId, edge] of edgeMap) {
    const key = pairKey(edge.sourceEquipmentId, edge.targetEquipmentId);
    if (!pairToEdgeIds.has(key)) pairToEdgeIds.set(key, []);
    pairToEdgeIds.get(key)!.push(edgeId);
  }

  // 2. BFS spanning tree
  const treeParent = new Map<string, { parentId: string; edgeId: string } | null>();
  const treeEdgeIds = new Set<string>();
  const visited = new Set<string>();

  for (const startId of adjacency.keys()) {
    if (visited.has(startId)) continue;
    visited.add(startId);
    treeParent.set(startId, null);
    const queue = [startId];
    let qHead = 0;

    while (qHead < queue.length) {
      const nodeId = queue[qHead++]!;
      for (const neighborId of adjacency.get(nodeId) ?? []) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        const key = pairKey(nodeId, neighborId);
        const edgeIds = pairToEdgeIds.get(key);
        if (!edgeIds || edgeIds.length === 0) continue;
        treeParent.set(neighborId, { parentId: nodeId, edgeId: edgeIds[0] });
        treeEdgeIds.add(edgeIds[0]);
        queue.push(neighborId);
      }
    }
  }

  // 3. Identify chords (non-tree edges)
  const chords: { edgeId: string; u: string; v: string }[] = [];
  for (const [edgeId, edge] of edgeMap) {
    if (!treeEdgeIds.has(edgeId)) {
      chords.push({ edgeId, u: edge.sourceEquipmentId, v: edge.targetEquipmentId });
    }
  }
  if (chords.length === 0) return [];

  // 4. For each chord, find fundamental cycle via LCA
  function ancestorList(nodeId: string): string[] {
    const path = [nodeId];
    let cur = nodeId;
    while (treeParent.get(cur)) {
      cur = treeParent.get(cur)!.parentId;
      path.push(cur);
    }
    return path;
  }

  function pathTo(from: string, to: string): { nodeIds: string[]; edgeIds: string[] } {
    const nodeIds = [from];
    const edgeIds: string[] = [];
    let cur = from;
    while (cur !== to) {
      const p = treeParent.get(cur);
      if (!p) break;
      edgeIds.push(p.edgeId);
      nodeIds.push(p.parentId);
      cur = p.parentId;
    }
    return { nodeIds, edgeIds };
  }

  const fundamentals: { nodeIds: string[]; edgeIds: string[] }[] = [];

  for (const chord of chords) {
    const ancestorsU = ancestorList(chord.u);
    const ancestorSetU = new Set(ancestorsU);
    const ancestorsV = ancestorList(chord.v);

    let lca: string | null = null;
    for (const a of ancestorsV) {
      if (ancestorSetU.has(a)) {
        lca = a;
        break;
      }
    }
    if (!lca) continue;

    const pathU = pathTo(chord.u, lca);
    const pathV = pathTo(chord.v, lca);

    // Merge: u->LCA + reverse(v->LCA without LCA) + chord
    const cycleNodeIds = [
      ...new Set([...pathU.nodeIds, ...pathV.nodeIds.slice(0, -1).reverse()]),
    ];
    const cycleEdgeIds = [...pathU.edgeIds, ...pathV.edgeIds, chord.edgeId];

    // Skip degenerate cycles (parallel edges between 2 nodes)
    if (cycleNodeIds.length >= 3) {
      fundamentals.push({ nodeIds: cycleNodeIds, edgeIds: cycleEdgeIds });
    }
  }
  if (fundamentals.length === 0) return [];

  // 5. Group cycles sharing edges (Union-Find)
  const n = fundamentals.length;
  const uf = Array.from({ length: n }, (_, i) => i);
  function find(x: number): number {
    while (uf[x] !== x) {
      uf[x] = uf[uf[x]];
      x = uf[x];
    }
    return x;
  }

  const edgeSets = fundamentals.map((c) => new Set(c.edgeIds));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (const eid of edgeSets[i]) {
        if (edgeSets[j].has(eid)) {
          uf[find(i)] = find(j);
          break;
        }
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(i);
  }

  // 6. Build TraceRings (level 0 + level 1)
  const rings: TraceRing[] = [];
  let counter = 0;

  function buildLabel(nodeIds: Iterable<string>): string {
    const names = new Set<string>();
    for (const nid of nodeIds) {
      const node = nodeMap.get(nid);
      if (node?.substationName) names.add(node.substationName);
    }
    return Array.from(names).join('\u2194');
  }

  for (const cycleIndices of groups.values()) {
    const childIds: string[] = [];

    // Fundamental rings (level 0)
    for (const idx of cycleIndices) {
      counter++;
      const id = `ring-${counter}`;
      childIds.push(id);
      rings.push({
        id,
        label: buildLabel(fundamentals[idx].nodeIds),
        nodeIds: fundamentals[idx].nodeIds,
        edgeIds: fundamentals[idx].edgeIds,
        level: 0,
        childRingIds: [],
      });
    }

    // Composite ring (level 1) -- only when multiple cycles share edges
    if (cycleIndices.length > 1) {
      const edgeCount = new Map<string, number>();
      for (const idx of cycleIndices) {
        for (const eid of fundamentals[idx].edgeIds) {
          edgeCount.set(eid, (edgeCount.get(eid) ?? 0) + 1);
        }
      }

      // XOR: edges appearing odd times form the outer perimeter
      const outerEdgeIds = [...edgeCount.entries()]
        .filter(([, c]) => c % 2 === 1)
        .map(([eid]) => eid);

      const outerNodeIds = new Set<string>();
      for (const eid of outerEdgeIds) {
        const edge = edgeMap.get(eid);
        if (edge) {
          outerNodeIds.add(edge.sourceEquipmentId);
          outerNodeIds.add(edge.targetEquipmentId);
        }
      }

      counter++;
      rings.push({
        id: `ring-${counter}`,
        label: buildLabel(outerNodeIds),
        nodeIds: [...outerNodeIds],
        edgeIds: outerEdgeIds,
        level: 1,
        childRingIds: childIds,
      });
    }
  }

  return rings;
}

// ==================== Main Trace Function ====================

export interface TraceCableInput {
  /** The cable to trace from */
  cableId: string;
  /** All cables (local state) */
  cables: LocalCable[];
  /** All equipment (local state) */
  equipment: FloorPlanEquipment[];
  /** Fiber paths (saved + pending, merged) */
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
 * For FIBER: traverses FiberPaths at OFDs (supporting port isolation).
 *
 * Runs entirely in-browser on local data.
 */
export function traceCable(input: TraceCableInput): TraceResult {
  const { cableId, cables, equipment, fiberPaths, roomContext } = input;

  // Default substation context
  const substationId = roomContext?.substationId ?? '';
  const substationName = roomContext?.substationName ?? '';
  const defaultRoomId = roomContext?.floorId ?? null;

  // Equipment lookup
  const equipMap = new Map(equipment.map((e) => [e.id, e]));

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
  // Adjacency list for ring detection
  const adjacency = new Map<string, Set<string>>();

  const addNode = (equipId: string, isSource: boolean, isTarget: boolean) => {
    if (nodeMap.has(equipId)) return;
    const equip = equipMap.get(equipId);
    if (equip) {
      nodeMap.set(
        equipId,
        toTraceNode(equip, isSource, isTarget, substationId, substationName, defaultRoomId),
      );
    } else {
      // Equipment from fiber paths (remote OFDs) -- create a minimal node
      nodeMap.set(equipId, {
        equipmentId: equipId,
        equipmentName: equipId,
        substationId: '',
        substationName: '',
        floorId: null,
        materialCategoryCode: 'EQP-OFD',
        isSource,
        isTarget,
      });
    }
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

  // 2. Build in-memory adjacency: equipmentId -> cables of same cableType
  const sameCables = cables.filter((c) => c.cableType === cableType);
  const cableAdjacency = new Map<string, LocalCable[]>();
  for (const cable of sameCables) {
    if (!cableAdjacency.has(cable.sourceEquipmentId)) {
      cableAdjacency.set(cable.sourceEquipmentId, []);
    }
    if (!cableAdjacency.has(cable.targetEquipmentId)) {
      cableAdjacency.set(cable.targetEquipmentId, []);
    }
    cableAdjacency.get(cable.sourceEquipmentId)!.push(cable);
    cableAdjacency.get(cable.targetEquipmentId)!.push(cable);
  }

  // 3. Identify OFD equipment for port-aware FIBER routing
  const ofdIds = new Set<string>();
  if (cableType === 'FIBER') {
    for (const cable of sameCables) {
      const srcEquip = equipMap.get(cable.sourceEquipmentId);
      const tgtEquip = equipMap.get(cable.targetEquipmentId);
      if (srcEquip?.materialCategoryCode === 'EQP-OFD') ofdIds.add(cable.sourceEquipmentId);
      if (tgtEquip?.materialCategoryCode === 'EQP-OFD') ofdIds.add(cable.targetEquipmentId);
    }
  }

  // BFS state
  const visited = new Set<string>();
  const visitedEdges = new Set<string>();
  // For OFDs: track reachable ports. Key = ofdId, Value = Set<"fpId:portNum">
  const ofdReachablePorts = new Map<string, Set<string>>();
  const queue: string[] = [];

  // Seed BFS with the starting cable's endpoints
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

  // Register OFD port context from the starting cable
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

  // Pre-build fiber cable lookup by fiberPathId for traverseFiberPaths
  const fiberCablesByPathId = new Map<string, LocalCable[]>();
  if (cableType === 'FIBER') {
    for (const cable of sameCables) {
      if (cable.fiberPathId) {
        let list = fiberCablesByPathId.get(cable.fiberPathId);
        if (!list) {
          list = [];
          fiberCablesByPathId.set(cable.fiberPathId, list);
        }
        list.push(cable);
      }
    }
  }

  // 4. BFS
  let qHead = 0;
  while (qHead < queue.length) {
    const equipId = queue[qHead++]!;
    const isOfd = ofdIds.has(equipId);

    const connectedCables = cableAdjacency.get(equipId) ?? [];

    for (const cable of connectedCables) {
      if (visitedEdges.has(cable.id)) continue;

      // FIBER + OFD port isolation
      if (cableType === 'FIBER' && cable.fiberPathId && cable.fiberPortNumber) {
        const portKey = `${cable.fiberPathId}:${cable.fiberPortNumber}`;
        if (isOfd) {
          const otherId2 =
            cable.sourceEquipmentId === equipId
              ? cable.targetEquipmentId
              : cable.sourceEquipmentId;
          if (ofdIds.has(otherId2)) {
            // OFD <-> OFD cable: enforce port isolation
            const reachable = ofdReachablePorts.get(equipId);
            if (!reachable || !reachable.has(portKey)) continue;
          }
          // OFD <-> non-OFD: always allow
        }
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
        cable.sourceEquipmentId === equipId
          ? cable.targetEquipmentId
          : cable.sourceEquipmentId;

      // Propagate port context for FIBER cables
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

    // FIBER only: if this equipment is an OFD, traverse FiberPaths (port-aware)
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

  // 5. Ring detection
  const nodes = Array.from(nodeMap.values());
  const edgesArr = Array.from(edgeMap.values());
  const rings = detectRings(adjacency, edgeMap, nodeMap);

  // 6. Build display segments
  const segments = buildPathSegments(nodes, edgesArr);

  return { nodes, edges: edgesArr, rings, segments };
}

// ==================== Fiber Path Traversal ====================

/**
 * For a given OFD equipment, traverse fiber paths through ports
 * that were reached during BFS (port-level connectivity).
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

  // Extract unique fiberPath IDs from reachable ports
  const reachableFpIds = new Set([...reachable].map((k) => k.split(':')[0]));

  // Filter fiber paths relevant to this OFD
  const relevantFps = fiberPaths.filter(
    (fp) =>
      reachableFpIds.has(fp.id) &&
      (fp.ofdA.id === ofdId || fp.ofdB.id === ofdId),
  );

  // Build lookup of other-side cables using pre-built fiberCablesByPathId map
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

  const fpById = new Map(relevantFps.map((fp) => [fp.id, fp]));

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

    // Build label: "local substation - remote substation"
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

    // Queue the remote OFD and propagate port context
    const remoteOfdId = fp.ofdA.id === ofdId ? fp.ofdB.id : fp.ofdA.id;
    if (!ofdReachablePorts.has(remoteOfdId)) ofdReachablePorts.set(remoteOfdId, new Set());
    ofdReachablePorts.get(remoteOfdId)!.add(portKey);

    if (!visited.has(remoteOfdId)) {
      visited.add(remoteOfdId);
      queue.push(remoteOfdId);
    }
  }
}
