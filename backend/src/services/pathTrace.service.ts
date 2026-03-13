/**
 * @deprecated 이 서비스는 FIBER 전용이며 cableTrace.service.ts로 대체될 예정입니다.
 * 새로운 기능은 CableTraceService를 사용하세요. (모든 케이블 타입 지원, BFS 기반 그래프 추적)
 */
import prisma from '../config/prisma.js';
import { NotFoundError } from '../utils/errors.js';

// ==================== Types ====================

export interface PathNode {
  equipmentId: string;
  equipmentName: string;
  substationId: string;
  substationName: string;
  category: string;
}

export interface PathHop {
  from: PathNode;
  to: PathNode;
  connectionType: 'cable' | 'fiber';
  connectionId: string;
  portNumber: number | null;
  cableType: string | null;
}

export interface TracedPath {
  id: string;
  hops: PathHop[];
  startEquipment: PathNode;
  endEquipment: PathNode;
  substations: string[];
}

export interface RingPath extends TracedPath {
  ringSize: number;
}

export interface PathTraceResult {
  equipment: PathNode;
  directPaths: TracedPath[];
  rings: RingPath[];
}

// ==================== Helpers ====================

const equipmentNodeSelect = {
  id: true,
  name: true,
  category: true,
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

function toPathNode(equip: any): PathNode {
  let substationId = '';
  let substationName = '';

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
    category: equip.category,
  };
}

// ==================== Service ====================

class PathTraceService {
  async trace(equipmentId: string): Promise<PathTraceResult> {
    const equipment = await prisma.equipment.findUnique({
      where: { id: equipmentId },
      select: equipmentNodeSelect,
    });

    if (!equipment) throw new NotFoundError('설비');

    const startNode = toPathNode(equipment);
    const directPaths: TracedPath[] = [];
    const rings: RingPath[] = [];
    let pathCounter = 0;

    // Find cables from this equipment that have fiberPathId + fiberPortNumber
    const fiberCables = await prisma.cable.findMany({
      where: {
        OR: [
          { sourceEquipmentId: equipmentId },
          { targetEquipmentId: equipmentId },
        ],
        fiberPathId: { not: null },
        fiberPortNumber: { not: null },
      },
      include: {
        sourceEquipment: { select: equipmentNodeSelect },
        targetEquipment: { select: equipmentNodeSelect },
        fiberPath: true,
      },
    });

    for (const cable of fiberCables) {
      const fiberPathId = cable.fiberPathId!;
      const portNumber = cable.fiberPortNumber!;

      // The OFD is the other end of this cable
      const localOfd =
        cable.sourceEquipmentId === equipmentId
          ? cable.targetEquipment
          : cable.sourceEquipment;

      const localOfdNode = toPathNode(localOfd);

      // First hop: startEquip -> localOFD (cable)
      const firstHop: PathHop = {
        from: startNode,
        to: localOfdNode,
        connectionType: 'cable',
        connectionId: cable.id,
        portNumber,
        cableType: cable.cableType,
      };

      // Find the remote OFD via the FiberPath
      const fiberPath = cable.fiberPath!;
      const remoteOfdId =
        fiberPath.ofdAId === localOfd.id ? fiberPath.ofdBId : fiberPath.ofdAId;

      // Recursive multi-hop tracing
      const visited = new Set<string>();
      visited.add(`${fiberPathId}:${portNumber}`);

      await this.traceFromOfd(
        equipmentId,
        startNode,
        localOfdNode,
        remoteOfdId,
        fiberPathId,
        portNumber,
        [firstHop],
        visited,
        directPaths,
        rings,
        () => ++pathCounter
      );
    }

    return {
      equipment: startNode,
      directPaths,
      rings,
    };
  }

  private async traceFromOfd(
    originalStartId: string,
    startNode: PathNode,
    localOfdNode: PathNode,
    remoteOfdId: string,
    fiberPathId: string,
    portNumber: number,
    currentHops: PathHop[],
    visited: Set<string>,
    directPaths: TracedPath[],
    rings: RingPath[],
    nextId: () => number
  ): Promise<void> {
    // Fetch remote OFD
    const remoteOfd = await prisma.equipment.findUnique({
      where: { id: remoteOfdId },
      select: equipmentNodeSelect,
    });

    if (!remoteOfd) return;

    const remoteOfdNode = toPathNode(remoteOfd);

    // Second hop: localOFD -> remoteOFD (fiber)
    const fiberHop: PathHop = {
      from: localOfdNode,
      to: remoteOfdNode,
      connectionType: 'fiber',
      connectionId: fiberPathId,
      portNumber,
      cableType: null,
    };

    const hopsWithFiber = [...currentHops, fiberHop];

    // Find cables on the remote OFD with same fiberPathId AND same fiberPortNumber
    const remoteCables = await prisma.cable.findMany({
      where: {
        OR: [
          { sourceEquipmentId: remoteOfdId },
          { targetEquipmentId: remoteOfdId },
        ],
        fiberPathId,
        fiberPortNumber: portNumber,
      },
      include: {
        sourceEquipment: { select: equipmentNodeSelect },
        targetEquipment: { select: equipmentNodeSelect },
      },
    });

    for (const remoteCable of remoteCables) {
      // The remote equipment is the other end of this cable (not the OFD)
      const remoteEquip =
        remoteCable.sourceEquipmentId === remoteOfdId
          ? remoteCable.targetEquipment
          : remoteCable.sourceEquipment;

      const remoteEquipNode = toPathNode(remoteEquip);

      // Third hop: remoteOFD -> remoteEquip (cable)
      const lastHop: PathHop = {
        from: remoteOfdNode,
        to: remoteEquipNode,
        connectionType: 'cable',
        connectionId: remoteCable.id,
        portNumber,
        cableType: remoteCable.cableType,
      };

      const fullHops = [...hopsWithFiber, lastHop];

      // Ring detection: arrived back at original start
      if (remoteEquip.id === originalStartId) {
        const substations = this.collectSubstations(fullHops);
        rings.push({
          id: `ring-${nextId()}`,
          hops: fullHops,
          startEquipment: startNode,
          endEquipment: startNode,
          substations,
          ringSize: fullHops.length,
        });
        continue;
      }

      // Check if remote equipment also connects to another OFD via fiber (multi-hop)
      const nextFiberCables = await prisma.cable.findMany({
        where: {
          OR: [
            { sourceEquipmentId: remoteEquip.id },
            { targetEquipmentId: remoteEquip.id },
          ],
          fiberPathId: { not: null },
          fiberPortNumber: { not: null },
        },
        include: {
          sourceEquipment: { select: equipmentNodeSelect },
          targetEquipment: { select: equipmentNodeSelect },
          fiberPath: true,
        },
      });

      let continued = false;

      for (const nextCable of nextFiberCables) {
        const nextFiberPathId = nextCable.fiberPathId!;
        const nextPortNumber = nextCable.fiberPortNumber!;
        const visitedKey = `${nextFiberPathId}:${nextPortNumber}`;

        if (visited.has(visitedKey)) continue;

        // The next OFD is the other end of this cable
        const nextLocalOfd =
          nextCable.sourceEquipmentId === remoteEquip.id
            ? nextCable.targetEquipment
            : nextCable.sourceEquipment;

        const nextLocalOfdNode = toPathNode(nextLocalOfd);

        // Hop: remoteEquip -> nextLocalOFD (cable)
        const bridgeHop: PathHop = {
          from: remoteEquipNode,
          to: nextLocalOfdNode,
          connectionType: 'cable',
          connectionId: nextCable.id,
          portNumber: nextPortNumber,
          cableType: nextCable.cableType,
        };

        const nextFiberPath = nextCable.fiberPath!;
        const nextRemoteOfdId =
          nextFiberPath.ofdAId === nextLocalOfd.id
            ? nextFiberPath.ofdBId
            : nextFiberPath.ofdAId;

        const nextVisited = new Set(visited);
        nextVisited.add(visitedKey);

        continued = true;

        await this.traceFromOfd(
          originalStartId,
          startNode,
          nextLocalOfdNode,
          nextRemoteOfdId,
          nextFiberPathId,
          nextPortNumber,
          [...fullHops, bridgeHop],
          nextVisited,
          directPaths,
          rings,
          nextId
        );
      }

      // If no further fiber hops, this is a terminal path
      if (!continued) {
        const substations = this.collectSubstations(fullHops);
        directPaths.push({
          id: `path-${nextId()}`,
          hops: fullHops,
          startEquipment: startNode,
          endEquipment: remoteEquipNode,
          substations,
        });
      }
    }
  }

  private collectSubstations(hops: PathHop[]): string[] {
    const names = new Set<string>();
    for (const hop of hops) {
      if (hop.from.substationName) names.add(hop.from.substationName);
      if (hop.to.substationName) names.add(hop.to.substationName);
    }
    return Array.from(names);
  }
}

export const pathTraceService = new PathTraceService();
