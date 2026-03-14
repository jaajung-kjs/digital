import prisma from '../config/prisma.js';
import { NotFoundError } from '../utils/errors.js';

// ==================== Types ====================

export interface TraceNode {
  equipmentId: string;
  equipmentName: string;
  substationId: string;
  substationName: string;
  roomId: string | null;
  category: string;
  isSource: boolean;
  isTarget: boolean;
}

export interface TraceEdge {
  id: string;
  sourceEquipmentId: string;
  targetEquipmentId: string;
  type: 'cable' | 'fiberPath';
  cableType?: string;
  label?: string;
  length?: number;
  fiberPathId?: string;
  fiberPathLabel?: string; // e.g. "남춘천-춘천"
  portCount?: number;
  fiberPortNumber?: number;
}

export interface TraceRing {
  id: string;
  label: string;
  nodeIds: string[];
  edgeIds: string[];
}

/** A node in a path segment with its incoming edge (ID references to avoid payload duplication) */
export interface SegmentNode {
  nodeId: string;
  /** Edge ID connecting from previous node in this segment (null for segment start) */
  edgeId: string | null;
}

/** A linear segment of directly connected nodes */
export interface PathSegment {
  nodes: SegmentNode[];
  /** equipmentId of the node this branch forks from (null for main segment) */
  branchPointId: string | null;
}

export interface TraceResult {
  nodes: TraceNode[];
  edges: TraceEdge[];
  rings: TraceRing[];
  segments: PathSegment[];
}

// ==================== Helpers ====================

const equipmentNodeSelect = {
  id: true,
  name: true,
  category: true,
  roomId: true,
  room: {
    select: {
      floor: {
        select: {
          substation: {
            select: { id: true, name: true },
          },
        },
      },
    },
  },
  rack: {
    select: {
      roomId: true,
      room: {
        select: {
          floor: {
            select: {
              substation: {
                select: { id: true, name: true },
              },
            },
          },
        },
      },
    },
  },
} as const;

type EquipmentRow = {
  id: string;
  name: string;
  category: string;
  roomId: string | null;
  room?: { floor: { substation: { id: string; name: string } } } | null;
  rack?: { roomId: string; room: { floor: { substation: { id: string; name: string } } } } | null;
};

function getSubstation(equip: EquipmentRow): { id: string; name: string } {
  return equip.room?.floor?.substation
    ?? equip.rack?.room?.floor?.substation
    ?? { id: '', name: '' };
}

function toTraceNode(
  equip: EquipmentRow,
  isSource: boolean,
  isTarget: boolean,
): TraceNode {
  const sub = getSubstation(equip);
  return {
    equipmentId: equip.id,
    equipmentName: equip.name,
    substationId: sub.id,
    substationName: sub.name,
    roomId: equip.roomId ?? equip.rack?.roomId ?? null,
    category: equip.category,
    isSource,
    isTarget,
  };
}

// ==================== Segment Builder ====================

/**
 * Build path segments using iterative DFS.
 *
 * - Follows the longest linear path first (lower-degree neighbors preferred)
 * - Branch points queue extra neighbors as pending branches
 * - Each branch segment starts with the branch-point node (shows the fork)
 * - Never produces false connections — every arrow = a real edge
 */
function buildPathSegments(nodes: TraceNode[], edges: TraceEdge[]): PathSegment[] {
  if (nodes.length === 0) return [];
  if (edges.length === 0) return nodes.map((n) => ({ nodes: [{ nodeId: n.equipmentId, edgeId: null }], branchPointId: null }));

  // Build undirected adjacency
  const adj = new Map<string, { neighborId: string; edgeId: string }[]>();
  for (const n of nodes) adj.set(n.equipmentId, []);
  for (const e of edges) {
    adj.get(e.sourceEquipmentId)?.push({ neighborId: e.targetEquipmentId, edgeId: e.id });
    adj.get(e.targetEquipmentId)?.push({ neighborId: e.sourceEquipmentId, edgeId: e.id });
  }

  // Precompute degrees once (avoids repeated lookups in sort comparisons)
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
      [{ nodeId: branch.neighborId, edgeId: branch.edgeId }],
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

// ==================== Service ====================

class CableTraceService {
  /**
   * Trace all connected equipment from a given cable using BFS.
   * Follows only cables of the same cableType.
   * For FIBER: traverses FiberPaths at OFDs (supporting 절체/switching).
   */
  async trace(cableId: string): Promise<TraceResult> {
    // 1. Load the starting cable
    const startCable = await prisma.cable.findUnique({
      where: { id: cableId },
      include: {
        sourceEquipment: { select: equipmentNodeSelect },
        targetEquipment: { select: equipmentNodeSelect },
      },
    });

    if (!startCable) throw new NotFoundError('케이블');

    const cableType = startCable.cableType;
    const sourceId = startCable.sourceEquipmentId;
    const targetId = startCable.targetEquipmentId;

    // Node and edge maps
    const nodeMap = new Map<string, TraceNode>();
    const edgeMap = new Map<string, TraceEdge>();
    // Adjacency list for ring detection: nodeId -> Set<{ neighborId, edgeId }>
    const adjacency = new Map<string, Set<string>>();

    const addNode = (equip: EquipmentRow) => {
      if (!nodeMap.has(equip.id)) {
        nodeMap.set(
          equip.id,
          toTraceNode(equip, equip.id === sourceId, equip.id === targetId),
        );
      }
    };

    const addEdge = (edge: TraceEdge) => {
      if (!edgeMap.has(edge.id)) {
        edgeMap.set(edge.id, edge);
        // Bidirectional adjacency
        if (!adjacency.has(edge.sourceEquipmentId)) {
          adjacency.set(edge.sourceEquipmentId, new Set());
        }
        if (!adjacency.has(edge.targetEquipmentId)) {
          adjacency.set(edge.targetEquipmentId, new Set());
        }
        adjacency.get(edge.sourceEquipmentId)!.add(edge.targetEquipmentId);
        adjacency.get(edge.targetEquipmentId)!.add(edge.sourceEquipmentId);
      }
    };

    // 2. Load ALL cables of this cableType upfront (avoid N+1)
    const allCables = await prisma.cable.findMany({
      where: { cableType },
      include: {
        sourceEquipment: { select: equipmentNodeSelect },
        targetEquipment: { select: equipmentNodeSelect },
      },
    });

    // Build in-memory adjacency map: equipmentId -> cable[]
    const cableAdjacency = new Map<string, typeof allCables>();
    for (const cable of allCables) {
      if (!cableAdjacency.has(cable.sourceEquipmentId)) {
        cableAdjacency.set(cable.sourceEquipmentId, []);
      }
      if (!cableAdjacency.has(cable.targetEquipmentId)) {
        cableAdjacency.set(cable.targetEquipmentId, []);
      }
      cableAdjacency.get(cable.sourceEquipmentId)!.push(cable);
      cableAdjacency.get(cable.targetEquipmentId)!.push(cable);
    }

    // 3. BFS using in-memory adjacency
    // For FIBER cables through OFDs, port isolation is critical:
    // Equipment A on port #1 and Equipment B on port #2 are NOT connected.
    // The BFS tracks which (fiberPathId, portNumber) brought us to each OFD,
    // so traverseFiberPaths only crosses matching ports.

    // Identify OFD equipment IDs for port-aware routing
    const ofdIds = new Set<string>();
    if (cableType === 'FIBER') {
      for (const cable of allCables) {
        if ((cable.sourceEquipment as EquipmentRow).category === 'OFD') {
          ofdIds.add(cable.sourceEquipmentId);
        }
        if ((cable.targetEquipment as EquipmentRow).category === 'OFD') {
          ofdIds.add(cable.targetEquipmentId);
        }
      }
    }

    const visited = new Set<string>(); // visited equipment IDs
    const visitedEdges = new Set<string>(); // visited edge keys
    // For OFDs: track which ports are reachable. Key = ofdId, Value = Set<"fpId:portNum">
    const ofdReachablePorts = new Map<string, Set<string>>();

    // BFS queue items: equipmentId
    const queue: string[] = [];

    // Seed BFS with the starting cable's endpoints
    addNode(startCable.sourceEquipment as EquipmentRow);
    addNode(startCable.targetEquipment as EquipmentRow);
    addEdge({
      id: startCable.id,
      sourceEquipmentId: sourceId,
      targetEquipmentId: targetId,
      type: 'cable',
      cableType: startCable.cableType,
      label: startCable.label ?? undefined,
      length: startCable.length ?? undefined,
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

    while (queue.length > 0) {
      const equipId = queue.shift()!;
      const isOfd = ofdIds.has(equipId);

      // Find all cables of the same type connected to this equipment (in-memory)
      const cables = cableAdjacency.get(equipId) ?? [];

      for (const cable of cables) {
        if (visitedEdges.has(cable.id)) continue;

        // FIBER + OFD port isolation: if this cable has port info and either end
        // is an OFD, only follow it if the OFD's port was already reached.
        // This prevents non-OFD nodes from freely entering OFDs on unrelated ports.
        if (cableType === 'FIBER' && cable.fiberPathId && cable.fiberPortNumber) {
          const portKey = `${cable.fiberPathId}:${cable.fiberPortNumber}`;
          const otherId2 =
            cable.sourceEquipmentId === equipId
              ? cable.targetEquipmentId
              : cable.sourceEquipmentId;
          // Check outgoing from OFD
          if (isOfd) {
            const reachable = ofdReachablePorts.get(equipId);
            if (!reachable || !reachable.has(portKey)) continue;
          }
          // Check incoming to OFD from non-OFD equipment
          if (!isOfd && ofdIds.has(otherId2)) {
            const reachable = ofdReachablePorts.get(otherId2);
            if (!reachable || !reachable.has(portKey)) continue;
          }
        }

        visitedEdges.add(cable.id);

        addNode(cable.sourceEquipment as EquipmentRow);
        addNode(cable.targetEquipment as EquipmentRow);
        addEdge({
          id: cable.id,
          sourceEquipmentId: cable.sourceEquipmentId,
          targetEquipmentId: cable.targetEquipmentId,
          type: 'cable',
          cableType: cable.cableType,
          label: cable.label ?? undefined,
          length: cable.length ?? undefined,
        });

        // Queue the other end
        const otherId =
          cable.sourceEquipmentId === equipId
            ? cable.targetEquipmentId
            : cable.sourceEquipmentId;

        // Propagate port context to the other end if it's also an OFD
        if (cableType === 'FIBER' && cable.fiberPathId && cable.fiberPortNumber) {
          const portKey = `${cable.fiberPathId}:${cable.fiberPortNumber}`;
          if (ofdIds.has(otherId)) {
            if (!ofdReachablePorts.has(otherId)) ofdReachablePorts.set(otherId, new Set());
            ofdReachablePorts.get(otherId)!.add(portKey);
          }
        }

        if (!visited.has(otherId)) {
          visited.add(otherId);
          queue.push(otherId);
        }
      }

      // FIBER only: if this equipment is an OFD, traverse FiberPaths (port-aware)
      if (cableType === 'FIBER' && isOfd) {
        await this.traverseFiberPaths(
          equipId,
          visited,
          visitedEdges,
          ofdReachablePorts,
          queue,
          addNode,
          addEdge,
        );
      }
    }

    // 3. Ring detection
    const nodes = Array.from(nodeMap.values());
    const edgesArr = Array.from(edgeMap.values());
    const rings = this.detectRings(adjacency, edgeMap, nodeMap);

    // 4. Build display segments (single source of truth)
    const segments = buildPathSegments(nodes, edgesArr);

    return { nodes, edges: edgesArr, rings, segments };
  }

  /**
   * For a given OFD equipment, find cables with fiberPath+port info,
   * then traverse only through ports where BOTH sides are occupied.
   * This ensures port-level connectivity validation (not path-level).
   */
  private async traverseFiberPaths(
    ofdId: string,
    visited: Set<string>,
    visitedEdges: Set<string>,
    ofdReachablePorts: Map<string, Set<string>>,
    queue: string[],
    addNode: (equip: EquipmentRow) => void,
    addEdge: (edge: TraceEdge) => void,
  ): Promise<void> {
    // Only traverse ports that were actually reached during BFS
    const reachable = ofdReachablePorts.get(ofdId);
    if (!reachable || reachable.size === 0) return;

    // Extract unique fiberPath IDs from reachable ports
    const reachableFpIds = [...new Set([...reachable].map((k) => k.split(':')[0]))];

    // Batch-fetch all referenced fiber paths and other-side cables (avoids N+1)
    const [allFiberPaths, allOtherSideCables] = await Promise.all([
      prisma.fiberPath.findMany({
        where: { id: { in: reachableFpIds } },
        include: {
          ofdA: { select: equipmentNodeSelect },
          ofdB: { select: equipmentNodeSelect },
        },
      }),
      prisma.cable.findMany({
        where: {
          fiberPathId: { in: reachableFpIds },
          fiberPortNumber: { not: null },
          NOT: { OR: [{ sourceEquipmentId: ofdId }, { targetEquipmentId: ofdId }] },
        },
        include: {
          sourceEquipment: { select: equipmentNodeSelect },
          targetEquipment: { select: equipmentNodeSelect },
        },
      }),
    ]);
    const fpById = new Map(allFiberPaths.map((fp) => [fp.id, fp]));
    const otherSideByKey = new Map(
      allOtherSideCables
        .filter((c) => c.fiberPortNumber != null)
        .map((c) => [`${c.fiberPathId}:${c.fiberPortNumber}`, c]),
    );

    // Only iterate over the reachable ports, not all OFD cables
    for (const portKey of reachable) {
      const [fpId, portNumStr] = portKey.split(':');
      const portNum = parseInt(portNumStr, 10);
      const edgeKey = `fp:${portKey}`;
      if (visitedEdges.has(edgeKey)) continue;
      visitedEdges.add(edgeKey);

      const otherSideCable = otherSideByKey.get(portKey);
      if (!otherSideCable) continue; // No cable on the other side of this port

      const fp = fpById.get(fpId);
      if (!fp) continue;

      const ofdA = fp.ofdA as EquipmentRow;
      const ofdB = fp.ofdB as EquipmentRow;
      addNode(ofdA);
      addNode(ofdB);

      // Build label from local OFD's perspective: "자국변전소-상대국변전소"
      const localSub = getSubstation(fp.ofdAId === ofdId ? ofdA : ofdB).name;
      const remoteSub = getSubstation(fp.ofdAId === ofdId ? ofdB : ofdA).name;
      const fiberPathLabel = `${localSub}-${remoteSub}`;

      addEdge({
        id: edgeKey,
        sourceEquipmentId: fp.ofdAId,
        targetEquipmentId: fp.ofdBId,
        type: 'fiberPath',
        cableType: 'FIBER',
        fiberPathId: fp.id,
        fiberPathLabel,
        portCount: fp.portCount,
        fiberPortNumber: portNum,
      });

      // Queue the remote OFD and propagate port context
      const remoteOfdId = fp.ofdAId === ofdId ? fp.ofdBId : fp.ofdAId;
      if (!ofdReachablePorts.has(remoteOfdId)) ofdReachablePorts.set(remoteOfdId, new Set());
      ofdReachablePorts.get(remoteOfdId)!.add(portKey);

      if (!visited.has(remoteOfdId)) {
        visited.add(remoteOfdId);
        queue.push(remoteOfdId);
      }
    }
  }

  /**
   * Detect cycles in the undirected graph using DFS.
   * Returns TraceRing[] with ring labels built from substation names.
   */
  private detectRings(
    adjacency: Map<string, Set<string>>,
    edgeMap: Map<string, TraceEdge>,
    nodeMap: Map<string, TraceNode>,
  ): TraceRing[] {
    const rings: TraceRing[] = [];
    const visited = new Set<string>();
    let ringCounter = 0;

    // Build edge lookup: "nodeA-nodeB" -> edgeId[] (sorted to deduplicate)
    // Use string[] to support parallel edges between the same pair
    const edgeLookup = new Map<string, string[]>();
    for (const [edgeId, edge] of edgeMap) {
      const key = [edge.sourceEquipmentId, edge.targetEquipmentId].sort().join('-');
      if (!edgeLookup.has(key)) {
        edgeLookup.set(key, []);
      }
      edgeLookup.get(key)!.push(edgeId);
    }

    // Iterative DFS-based cycle detection (avoids stack overflow)
    const parent = new Map<string, string | null>();

    for (const startNodeId of adjacency.keys()) {
      if (visited.has(startNodeId)) continue;

      const stack: Array<{ nodeId: string; parentId: string | null; neighborIter: Iterator<string> }> = [];
      visited.add(startNodeId);
      parent.set(startNodeId, null);
      const neighbors = adjacency.get(startNodeId);
      if (neighbors) {
        stack.push({ nodeId: startNodeId, parentId: null, neighborIter: neighbors.values() });
      }

      while (stack.length > 0) {
        const frame = stack[stack.length - 1];
        const next = frame.neighborIter.next();

        if (next.done) {
          stack.pop();
          continue;
        }

        const neighborId = next.value;
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          parent.set(neighborId, frame.nodeId);
          const nbNeighbors = adjacency.get(neighborId);
          if (nbNeighbors) {
            stack.push({ nodeId: neighborId, parentId: frame.nodeId, neighborIter: nbNeighbors.values() });
          }
        } else if (neighborId !== frame.parentId) {
          // Found a cycle: backtrack from frame.nodeId to neighborId via parent chain
          const ringNodeIds: string[] = [];
          const ringEdgeIds: string[] = [];

          let current: string | null = frame.nodeId;
          while (current && current !== neighborId) {
            ringNodeIds.push(current);
            const prev: string | null = parent.get(current) ?? null;
            if (prev) {
              const edgeKey = [current, prev].sort().join('-');
              const edgeIds = edgeLookup.get(edgeKey);
              if (edgeIds) ringEdgeIds.push(...edgeIds);
            }
            current = prev;
          }
          if (current === neighborId) {
            ringNodeIds.push(neighborId);
            // Close the ring edge
            const closeKey = [frame.nodeId, neighborId].sort().join('-');
            const closeEdgeIds = edgeLookup.get(closeKey);
            if (closeEdgeIds) ringEdgeIds.push(...closeEdgeIds);
          }

          // Build label from unique substation names
          const substationNames = new Set<string>();
          for (const nid of ringNodeIds) {
            const node = nodeMap.get(nid);
            if (node?.substationName) substationNames.add(node.substationName);
          }

          ringCounter++;
          rings.push({
            id: `ring-${ringCounter}`,
            label: Array.from(substationNames).join('↔'),
            nodeIds: ringNodeIds,
            edgeIds: ringEdgeIds,
          });
        }
      }
    }

    return rings;
  }
}

export const cableTraceService = new CableTraceService();
