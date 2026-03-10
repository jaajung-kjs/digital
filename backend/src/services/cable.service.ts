import prisma from '../config/prisma.js';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors.js';
import { CableType } from '@prisma/client';

// ==================== Types ====================

export interface CableDetail {
  id: string;
  sourcePortId: string;
  targetPortId: string;
  cableType: CableType;
  label: string | null;
  length: number | null;
  color: string | null;
  pathPoints: unknown;
  description: string | null;
  sourcePort: {
    id: string;
    name: string;
    portType: string;
    equipment: {
      id: string;
      name: string;
      rackId: string | null;
      roomId: string | null;
    };
  };
  targetPort: {
    id: string;
    name: string;
    portType: string;
    equipment: {
      id: string;
      name: string;
      rackId: string | null;
      roomId: string | null;
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCableInput {
  sourcePortId: string;
  targetPortId: string;
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
  sourcePort: {
    select: {
      id: true,
      name: true,
      portType: true,
      equipment: {
        select: {
          id: true,
          name: true,
          rackId: true,
          roomId: true,
        },
      },
    },
  },
  targetPort: {
    select: {
      id: true,
      name: true,
      portType: true,
      equipment: {
        select: {
          id: true,
          name: true,
          rackId: true,
          roomId: true,
        },
      },
    },
  },
} as const;

class CableService {
  /**
   * 모든 케이블 조회
   */
  async getAll(): Promise<CableDetail[]> {
    const cables = await prisma.cable.findMany({
      include: cableInclude,
      orderBy: { createdAt: 'desc' },
    });

    return cables.map((c) => this.mapToDetail(c));
  }

  /**
   * 케이블 상세 조회
   */
  async getById(id: string): Promise<CableDetail> {
    const cable = await prisma.cable.findUnique({
      where: { id },
      include: cableInclude,
    });

    if (!cable) {
      throw new NotFoundError('케이블');
    }

    return this.mapToDetail(cable);
  }

  /**
   * 케이블 생성
   */
  async create(input: CreateCableInput, userId: string): Promise<CableDetail> {
    // 소스/타겟 포트 존재 확인
    const [sourcePort, targetPort] = await Promise.all([
      prisma.port.findUnique({ where: { id: input.sourcePortId } }),
      prisma.port.findUnique({ where: { id: input.targetPortId } }),
    ]);

    if (!sourcePort) {
      throw new NotFoundError('소스 포트');
    }
    if (!targetPort) {
      throw new NotFoundError('타겟 포트');
    }

    if (input.sourcePortId === input.targetPortId) {
      throw new ValidationError('소스 포트와 타겟 포트는 서로 달라야 합니다.');
    }

    // 중복 연결 확인
    const existing = await prisma.cable.findFirst({
      where: {
        OR: [
          { sourcePortId: input.sourcePortId, targetPortId: input.targetPortId },
          { sourcePortId: input.targetPortId, targetPortId: input.sourcePortId },
        ],
      },
    });

    if (existing) {
      throw new ConflictError('해당 포트 간 케이블이 이미 존재합니다.');
    }

    const cable = await prisma.cable.create({
      data: {
        sourcePortId: input.sourcePortId,
        targetPortId: input.targetPortId,
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

  /**
   * 케이블 수정
   */
  async update(id: string, input: UpdateCableInput, userId: string): Promise<CableDetail> {
    const existing = await prisma.cable.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('케이블');
    }

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

  /**
   * 케이블 삭제
   */
  async delete(id: string): Promise<void> {
    const cable = await prisma.cable.findUnique({
      where: { id },
    });

    if (!cable) {
      throw new NotFoundError('케이블');
    }

    await prisma.cable.delete({
      where: { id },
    });
  }

  /**
   * 실(Room)에 연결된 모든 케이블 조회
   * 랙 또는 Room에 속한 설비의 포트를 통해 연결된 케이블을 조회
   */
  async getByRoomId(roomId: string): Promise<CableDetail[]> {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      throw new NotFoundError('실');
    }

    // 해당 Room의 랙에 속한 설비 + Room에 직접 배치된 설비의 포트를 통한 케이블 조회
    const cables = await prisma.cable.findMany({
      where: {
        OR: [
          {
            sourcePort: {
              equipment: {
                OR: [
                  { rack: { roomId } },
                  { roomId },
                ],
              },
            },
          },
          {
            targetPort: {
              equipment: {
                OR: [
                  { rack: { roomId } },
                  { roomId },
                ],
              },
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
      sourcePortId: c.sourcePortId,
      targetPortId: c.targetPortId,
      cableType: c.cableType,
      label: c.label,
      length: c.length,
      color: c.color,
      pathPoints: c.pathPoints,
      description: c.description,
      sourcePort: {
        id: c.sourcePort.id,
        name: c.sourcePort.name,
        portType: c.sourcePort.portType,
        equipment: {
          id: c.sourcePort.equipment.id,
          name: c.sourcePort.equipment.name,
          rackId: c.sourcePort.equipment.rackId,
          roomId: c.sourcePort.equipment.roomId,
        },
      },
      targetPort: {
        id: c.targetPort.id,
        name: c.targetPort.name,
        portType: c.targetPort.portType,
        equipment: {
          id: c.targetPort.equipment.id,
          name: c.targetPort.equipment.name,
          rackId: c.targetPort.equipment.rackId,
          roomId: c.targetPort.equipment.roomId,
        },
      },
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }
}

export const cableService = new CableService();
