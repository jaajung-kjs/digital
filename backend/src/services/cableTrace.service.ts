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
  portCount?: number;
}

export interface TraceRing {
  id: string;
  label: string;
  nodeIds: string[];
  edgeIds: string[];
}

export interface TraceResult {
  nodes: TraceNode[];
  edges: TraceEdge[];
  rings: TraceRing[];
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

function toTraceNode(
  equip: EquipmentRow,
  isSource: boolean,
  isTarget: boolean,
): TraceNode {
  let substationId = '';
  let substationName = '';
  const roomId = equip.roomId ?? equip.rack?.roomId ?? null;

  if (equip.room?.floor?.substation) {
    substationId = equip.room.floor.substation.id;
    substationName = equip.room.floor.substation.name;
  } else if (equip.rack?.room?.floor?.substation) {
    substationId = equip.rack.room.floor.substation.id;
    substationName = equip.rack.room.floor.substation.name;
  }

  return {
    equipmentId: equip.id,
    equipmentName: equip.name,
    substationId,
    substationName,
    roomId,
    category: equip.category,
    isSource,
    isTarget,
  };
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

    // 2. BFS
    const visited = new Set<string>(); // visited equipment IDs
    const visitedEdges = new Set<string>(); // visited edge keys
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

    queue.push(sourceId, targetId);
    visited.add(sourceId);
    visited.add(targetId);

    while (queue.length > 0) {
      const equipId = queue.shift()!;

      // Find all cables of the same type connected to this equipment
      const cables = await prisma.cable.findMany({
        where: {
          OR: [
            { sourceEquipmentId: equipId },
            { targetEquipmentId: equipId },
          ],
          cableType,
        },
        include: {
          sourceEquipment: { select: equipmentNodeSelect },
          targetEquipment: { select: equipmentNodeSelect },
        },
      });

      for (const cable of cables) {
        if (visitedEdges.has(cable.id)) continue;
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

        if (!visited.has(otherId)) {
          visited.add(otherId);
          queue.push(otherId);
        }
      }

      // FIBER only: if this equipment is an OFD, traverse FiberPaths
      if (cableType === 'FIBER') {
        const node = nodeMap.get(equipId);
        if (node && node.category === 'OFD') {
          await this.traverseFiberPaths(
            equipId,
            visited,
            visitedEdges,
            queue,
            nodeMap,
            addNode,
            addEdge,
          );
        }
      }
    }

    // 3. Ring detection
    const rings = this.detectRings(adjacency, edgeMap, nodeMap);

    return {
      nodes: Array.from(nodeMap.values()),
      edges: Array.from(edgeMap.values()),
      rings,
    };
  }

  /**
   * For a given OFD equipment, find ALL FiberPaths it belongs to,
   * add them as fiberPath edges, and enqueue the remote OFDs.
   */
  private async traverseFiberPaths(
    ofdId: string,
    visited: Set<string>,
    visitedEdges: Set<string>,
    queue: string[],
    _nodeMap: Map<string, TraceNode>,
    addNode: (equip: EquipmentRow) => void,
    addEdge: (edge: TraceEdge) => void,
  ): Promise<void> {
    const fiberPaths = await prisma.fiberPath.findMany({
      where: {
        OR: [{ ofdAId: ofdId }, { ofdBId: ofdId }],
      },
      include: {
        ofdA: { select: equipmentNodeSelect },
        ofdB: { select: equipmentNodeSelect },
      },
    });

    for (const fp of fiberPaths) {
      const edgeKey = `fp:${fp.id}`;
      if (visitedEdges.has(edgeKey)) continue;
      visitedEdges.add(edgeKey);

      addNode(fp.ofdA as EquipmentRow);
      addNode(fp.ofdB as EquipmentRow);
      addEdge({
        id: edgeKey,
        sourceEquipmentId: fp.ofdAId,
        targetEquipmentId: fp.ofdBId,
        type: 'fiberPath',
        fiberPathId: fp.id,
        portCount: fp.portCount,
      });

      // Queue the remote OFD
      const remoteOfdId = fp.ofdAId === ofdId ? fp.ofdBId : fp.ofdAId;
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

    // Build edge lookup: "nodeA-nodeB" -> edgeId (sorted to deduplicate)
    const edgeLookup = new Map<string, string>();
    for (const [edgeId, edge] of edgeMap) {
      const key = [edge.sourceEquipmentId, edge.targetEquipmentId].sort().join('-');
      // Multiple edges between same pair possible, just keep one per pair
      if (!edgeLookup.has(key)) {
        edgeLookup.set(key, edgeId);
      }
    }

    // DFS-based cycle detection
    const parent = new Map<string, string | null>();

    const dfs = (nodeId: string, parentId: string | null) => {
      visited.add(nodeId);
      parent.set(nodeId, parentId);

      const neighbors = adjacency.get(nodeId);
      if (!neighbors) return;

      for (const neighborId of neighbors) {
        if (!visited.has(neighborId)) {
          dfs(neighborId, nodeId);
        } else if (neighborId !== parentId && visited.has(neighborId)) {
          // Found a cycle: backtrack from nodeId to neighborId via parent chain
          const ringNodeIds: string[] = [];
          const ringEdgeIds: string[] = [];

          let current: string | null = nodeId;
          while (current && current !== neighborId) {
            ringNodeIds.push(current);
            const prev: string | null = parent.get(current) ?? null;
            if (prev) {
              const edgeKey = [current, prev].sort().join('-');
              const edgeId = edgeLookup.get(edgeKey);
              if (edgeId) ringEdgeIds.push(edgeId);
            }
            current = prev;
          }
          if (current === neighborId) {
            ringNodeIds.push(neighborId);
            // Close the ring edge
            const closeKey = [nodeId, neighborId].sort().join('-');
            const closeEdgeId = edgeLookup.get(closeKey);
            if (closeEdgeId) ringEdgeIds.push(closeEdgeId);
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
    };

    for (const nodeId of adjacency.keys()) {
      if (!visited.has(nodeId)) {
        dfs(nodeId, null);
      }
    }

    return rings;
  }
}

export const cableTraceService = new CableTraceService();
