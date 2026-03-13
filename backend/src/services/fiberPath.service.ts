import prisma from '../config/prisma.js';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors.js';

// ==================== Types ====================

export interface FiberPathDetail {
  id: string;
  ofdA: { id: string; name: string; substationName: string; roomId: string | null };
  ofdB: { id: string; name: string; substationName: string; roomId: string | null };
  portCount: number;
  description: string | null;
  ports: FiberPortStatus[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FiberPortStatus {
  portNumber: number;
  sideA: { cableId: string; equipmentId: string; equipmentName: string } | null;
  sideB: { cableId: string; equipmentId: string; equipmentName: string } | null;
}

export interface CreateFiberPathInput {
  ofdAId: string;
  ofdBId: string;
  portCount: number;
  description?: string;
}

// ==================== Helpers ====================

const equipmentWithSubstation = {
  select: {
    id: true,
    name: true,
    category: true,
    roomId: true,
    room: {
      select: {
        id: true,
        floor: {
          select: {
            substation: {
              select: { name: true },
            },
          },
        },
      },
    },
    rack: {
      select: {
        room: {
          select: {
            id: true,
            floor: {
              select: {
                substation: {
                  select: { name: true },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

function getSubstationName(equipment: any): string {
  if (equipment.room?.floor?.substation?.name) {
    return equipment.room.floor.substation.name;
  }
  if (equipment.rack?.room?.floor?.substation?.name) {
    return equipment.rack.room.floor.substation.name;
  }
  return '';
}

function getRoomId(equipment: any): string | null {
  if (equipment.roomId) return equipment.roomId;
  if (equipment.room?.id) return equipment.room.id;
  if (equipment.rack?.room?.id) return equipment.rack.room.id;
  return null;
}

// ==================== Service ====================

class FiberPathService {
  async getByOfdId(ofdId: string): Promise<FiberPathDetail[]> {
    const paths = await prisma.fiberPath.findMany({
      where: {
        OR: [{ ofdAId: ofdId }, { ofdBId: ofdId }],
      },
      include: {
        ofdA: equipmentWithSubstation,
        ofdB: equipmentWithSubstation,
        cables: {
          include: {
            sourceEquipment: { select: { id: true, name: true } },
            targetEquipment: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return paths.map((p) => this.mapToDetail(p));
  }

  async getById(id: string): Promise<FiberPathDetail> {
    const path = await prisma.fiberPath.findUnique({
      where: { id },
      include: {
        ofdA: equipmentWithSubstation,
        ofdB: equipmentWithSubstation,
        cables: {
          include: {
            sourceEquipment: { select: { id: true, name: true } },
            targetEquipment: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!path) throw new NotFoundError('광경로');
    return this.mapToDetail(path);
  }

  async create(input: CreateFiberPathInput, userId: string): Promise<FiberPathDetail> {
    // Invariant: portCount must be 24 or 48
    if (input.portCount !== 24 && input.portCount !== 48) {
      throw new ValidationError('포트 수는 24 또는 48이어야 합니다.');
    }

    // Invariant: no self-loop
    if (input.ofdAId === input.ofdBId) {
      throw new ValidationError('OFD A와 OFD B는 서로 달라야 합니다.');
    }

    // Validate both equipment exist and are OFD category
    const [ofdA, ofdB] = await Promise.all([
      prisma.equipment.findUnique({ where: { id: input.ofdAId }, select: { id: true, category: true } }),
      prisma.equipment.findUnique({ where: { id: input.ofdBId }, select: { id: true, category: true } }),
    ]);

    if (!ofdA) throw new NotFoundError('OFD A 설비');
    if (!ofdB) throw new NotFoundError('OFD B 설비');

    if (ofdA.category !== 'OFD') {
      throw new ValidationError('OFD A 설비의 카테고리가 OFD가 아닙니다.');
    }
    if (ofdB.category !== 'OFD') {
      throw new ValidationError('OFD B 설비의 카테고리가 OFD가 아닙니다.');
    }

    // Normalize UUID order: ofdAId < ofdBId (alphabetical)
    const [normalizedAId, normalizedBId] =
      input.ofdAId < input.ofdBId
        ? [input.ofdAId, input.ofdBId]
        : [input.ofdBId, input.ofdAId];

    // Check for duplicate path
    const existing = await prisma.fiberPath.findUnique({
      where: { ofdAId_ofdBId: { ofdAId: normalizedAId, ofdBId: normalizedBId } },
    });

    if (existing) {
      throw new ConflictError('해당 OFD 간 광경로가 이미 존재합니다.');
    }

    const created = await prisma.fiberPath.create({
      data: {
        ofdAId: normalizedAId,
        ofdBId: normalizedBId,
        portCount: input.portCount,
        description: input.description,
        createdById: userId,
        updatedById: userId,
      },
      include: {
        ofdA: equipmentWithSubstation,
        ofdB: equipmentWithSubstation,
        cables: {
          include: {
            sourceEquipment: { select: { id: true, name: true } },
            targetEquipment: { select: { id: true, name: true } },
          },
        },
      },
    });

    return this.mapToDetail(created);
  }

  async delete(id: string): Promise<void> {
    const path = await prisma.fiberPath.findUnique({ where: { id } });
    if (!path) throw new NotFoundError('광경로');
    await prisma.fiberPath.delete({ where: { id } });
  }

  private buildPortStatuses(fiberPath: any): FiberPortStatus[] {
    const ports: FiberPortStatus[] = [];
    const cables: any[] = fiberPath.cables || [];
    const ofdAId: string = fiberPath.ofdAId;
    const ofdBId: string = fiberPath.ofdBId;

    for (let portNumber = 1; portNumber <= fiberPath.portCount; portNumber++) {
      let sideA: FiberPortStatus['sideA'] = null;
      let sideB: FiberPortStatus['sideB'] = null;

      for (const cable of cables) {
        if (cable.fiberPortNumber !== portNumber) continue;

        // Determine which OFD this cable connects to, and what the OTHER end is
        const sourceId = cable.sourceEquipmentId;
        const targetId = cable.targetEquipmentId;

        if (sourceId === ofdAId || targetId === ofdAId) {
          // This cable connects to ofdA — the other end is the connected equipment for sideA
          const otherEquip =
            sourceId === ofdAId ? cable.targetEquipment : cable.sourceEquipment;
          sideA = {
            cableId: cable.id,
            equipmentId: otherEquip.id,
            equipmentName: otherEquip.name,
          };
        }

        if (sourceId === ofdBId || targetId === ofdBId) {
          // This cable connects to ofdB — the other end is the connected equipment for sideB
          const otherEquip =
            sourceId === ofdBId ? cable.targetEquipment : cable.sourceEquipment;
          sideB = {
            cableId: cable.id,
            equipmentId: otherEquip.id,
            equipmentName: otherEquip.name,
          };
        }
      }

      ports.push({ portNumber, sideA, sideB });
    }

    return ports;
  }

  private mapToDetail(p: any): FiberPathDetail {
    return {
      id: p.id,
      ofdA: {
        id: p.ofdA.id,
        name: p.ofdA.name,
        substationName: getSubstationName(p.ofdA),
        roomId: getRoomId(p.ofdA),
      },
      ofdB: {
        id: p.ofdB.id,
        name: p.ofdB.name,
        substationName: getSubstationName(p.ofdB),
        roomId: getRoomId(p.ofdB),
      },
      portCount: p.portCount,
      description: p.description,
      ports: this.buildPortStatuses(p),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }
}

export const fiberPathService = new FiberPathService();
