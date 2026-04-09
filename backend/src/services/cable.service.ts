import prisma from '../config/prisma.js';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors.js';
import { CableType } from '@prisma/client';

// ==================== Types ====================

export interface CableDetail {
  id: string;
  sourceEquipmentId: string;
  targetEquipmentId: string;
  cableType: CableType;
  label: string | null;
  length: number | null;
  color: string | null;
  pathPoints: unknown;
  description: string | null;
  fiberPathId: string | null;
  fiberPortNumber: number | null;
  fiberPathDescription: string | null;
  sourceEquipment: {
    id: string;
    name: string;
    rackId: string | null;
    roomId: string | null;
  };
  targetEquipment: {
    id: string;
    name: string;
    rackId: string | null;
    roomId: string | null;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCableInput {
  sourceEquipmentId: string;
  targetEquipmentId: string;
  cableType: CableType;
  label?: string;
  length?: number;
  color?: string;
  description?: string;
}

export interface UpdateCableInput {
  cableType?: CableType;
  label?: string;
  length?: number;
  color?: string;
  pathPoints?: unknown;
  description?: string;
}

// ==================== Service ====================

const cableInclude = {
  sourceEquipment: {
    select: {
      id: true,
      name: true,
      rackId: true,
      roomId: true,
    },
  },
  targetEquipment: {
    select: {
      id: true,
      name: true,
      rackId: true,
      roomId: true,
    },
  },
  fiberPath: {
    select: {
      id: true,
      ofdAId: true,
      ofdBId: true,
      ofdA: { select: { room: { select: { floor: { select: { substation: { select: { name: true } } } } } } } },
      ofdB: { select: { room: { select: { floor: { select: { substation: { select: { name: true } } } } } } } },
    },
  },
} as const;

class CableService {
  async getAll(): Promise<CableDetail[]> {
    const cables = await prisma.cable.findMany({
      include: cableInclude,
      orderBy: { createdAt: 'desc' },
    });
    return cables.map((c) => this.mapToDetail(c));
  }

  async getById(id: string): Promise<CableDetail> {
    const cable = await prisma.cable.findUnique({
      where: { id },
      include: cableInclude,
    });
    if (!cable) throw new NotFoundError('케이블');
    return this.mapToDetail(cable);
  }

  async create(input: CreateCableInput, userId: string): Promise<CableDetail> {
    const [source, target] = await Promise.all([
      prisma.equipment.findUnique({ where: { id: input.sourceEquipmentId } }),
      prisma.equipment.findUnique({ where: { id: input.targetEquipmentId } }),
    ]);

    if (!source) throw new NotFoundError('소스 설비');
    if (!target) throw new NotFoundError('타겟 설비');

    if (input.sourceEquipmentId === input.targetEquipmentId) {
      throw new ValidationError('소스 설비와 타겟 설비는 서로 달라야 합니다.');
    }

    // 동일 타입 중복 연결 확인
    const existing = await prisma.cable.findFirst({
      where: {
        cableType: input.cableType,
        OR: [
          { sourceEquipmentId: input.sourceEquipmentId, targetEquipmentId: input.targetEquipmentId },
          { sourceEquipmentId: input.targetEquipmentId, targetEquipmentId: input.sourceEquipmentId },
        ],
      },
    });

    if (existing) {
      throw new ConflictError('해당 설비 간 동일 타입 케이블이 이미 존재합니다.');
    }

    const cable = await prisma.cable.create({
      data: {
        sourceEquipmentId: input.sourceEquipmentId,
        targetEquipmentId: input.targetEquipmentId,
        cableType: input.cableType,
        label: input.label,
        length: input.length,
        color: input.color,
        description: input.description,
        createdById: userId,
        updatedById: userId,
      },
      include: cableInclude,
    });

    return this.mapToDetail(cable);
  }

  async update(id: string, input: UpdateCableInput, userId: string): Promise<CableDetail> {
    const existing = await prisma.cable.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('케이블');

    const cable = await prisma.cable.update({
      where: { id },
      data: {
        cableType: input.cableType,
        label: input.label,
        length: input.length,
        color: input.color,
        pathPoints: input.pathPoints as any,
        description: input.description,
        updatedById: userId,
      },
      include: cableInclude,
    });

    return this.mapToDetail(cable);
  }

  async delete(id: string): Promise<void> {
    const cable = await prisma.cable.findUnique({ where: { id } });
    if (!cable) throw new NotFoundError('케이블');
    await prisma.cable.delete({ where: { id } });
  }

  /**
   * 실(Room)에 연결된 모든 케이블 조회
   * 해당 Room의 랙에 속한 설비 + Room에 직접 배치된 설비 간의 케이블
   */
  async getByRoomId(roomId: string): Promise<CableDetail[]> {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundError('실');

    const cables = await prisma.cable.findMany({
      where: {
        OR: [
          {
            sourceEquipment: {
              OR: [
                { rack: { roomId } },
                { roomId },
              ],
            },
          },
          {
            targetEquipment: {
              OR: [
                { rack: { roomId } },
                { roomId },
              ],
            },
          },
        ],
      },
      include: cableInclude,
      orderBy: { createdAt: 'desc' },
    });

    return cables.map((c) => this.mapToDetail(c));
  }

  private mapToDetail(c: any): CableDetail {
    return {
      id: c.id,
      sourceEquipmentId: c.sourceEquipmentId,
      targetEquipmentId: c.targetEquipmentId,
      cableType: c.cableType,
      label: c.label,
      length: c.length,
      color: c.color,
      pathPoints: c.pathPoints,
      description: c.description,
      fiberPathId: c.fiberPathId ?? null,
      fiberPortNumber: c.fiberPortNumber ?? null,
      fiberPathDescription: this.buildFiberPathLabel(c),
      sourceEquipment: {
        id: c.sourceEquipment.id,
        name: c.sourceEquipment.name,
        rackId: c.sourceEquipment.rackId,
        roomId: c.sourceEquipment.roomId,
      },
      targetEquipment: {
        id: c.targetEquipment.id,
        name: c.targetEquipment.name,
        rackId: c.targetEquipment.rackId,
        roomId: c.targetEquipment.roomId,
      },
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

  /**
   * Build fiber path label oriented as "자국-대국" (local substation first).
   * The cable connects an equipment to an OFD; that OFD sits on one side of the fiber path.
   * The local substation is the OFD side the cable touches; remote is the other side.
   */
  private buildFiberPathLabel(c: any): string | null {
    const fp = c.fiberPath;
    if (!fp) return null;

    const nameA = fp.ofdA?.room?.floor?.substation?.name;
    const nameB = fp.ofdB?.room?.floor?.substation?.name;
    if (!nameA || !nameB) return null;

    // Cable connects to source or target OFD — determine which side is "local"
    const cableOfdId = c.sourceEquipmentId === fp.ofdAId || c.targetEquipmentId === fp.ofdAId
      ? fp.ofdAId
      : fp.ofdBId;

    const localName = cableOfdId === fp.ofdAId ? nameA : nameB;
    const remoteName = cableOfdId === fp.ofdAId ? nameB : nameA;
    return `${localName}-${remoteName}`;
  }
}

export const cableService = new CableService();
