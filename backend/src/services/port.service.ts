import prisma from '../config/prisma.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';
import { PortType } from '@prisma/client';

// ==================== Types ====================

export interface PortDetail {
  id: string;
  equipmentId: string;
  name: string;
  portType: PortType;
  portNumber: number | null;
  label: string | null;
  speed: string | null;
  connectorType: string | null;
  description: string | null;
  sortOrder: number;
  isConnected: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePortInput {
  name: string;
  portType: PortType;
  portNumber?: number;
  label?: string;
  speed?: string;
  connectorType?: string;
  description?: string;
}

export interface UpdatePortInput {
  name?: string;
  portType?: PortType;
  portNumber?: number;
  label?: string;
  speed?: string;
  connectorType?: string;
  description?: string;
  sortOrder?: number;
}

// ==================== Service ====================

class PortService {
  /**
   * 설비의 모든 포트 조회
   */
  async getByEquipmentId(equipmentId: string): Promise<PortDetail[]> {
    const equipment = await prisma.equipment.findUnique({
      where: { id: equipmentId },
    });

    if (!equipment) {
      throw new NotFoundError('설비');
    }

    const ports = await prisma.port.findMany({
      where: { equipmentId },
      include: {
        sourceCables: { select: { id: true } },
        targetCables: { select: { id: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { portNumber: 'asc' }],
    });

    return ports.map((p) => ({
      id: p.id,
      equipmentId: p.equipmentId,
      name: p.name,
      portType: p.portType,
      portNumber: p.portNumber,
      label: p.label,
      speed: p.speed,
      connectorType: p.connectorType,
      description: p.description,
      sortOrder: p.sortOrder,
      isConnected: p.sourceCables.length > 0 || p.targetCables.length > 0,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  }

  /**
   * 포트 상세 조회
   */
  async getById(id: string): Promise<PortDetail> {
    const port = await prisma.port.findUnique({
      where: { id },
      include: {
        sourceCables: { select: { id: true } },
        targetCables: { select: { id: true } },
      },
    });

    if (!port) {
      throw new NotFoundError('포트');
    }

    return {
      id: port.id,
      equipmentId: port.equipmentId,
      name: port.name,
      portType: port.portType,
      portNumber: port.portNumber,
      label: port.label,
      speed: port.speed,
      connectorType: port.connectorType,
      description: port.description,
      sortOrder: port.sortOrder,
      isConnected: port.sourceCables.length > 0 || port.targetCables.length > 0,
      createdAt: port.createdAt,
      updatedAt: port.updatedAt,
    };
  }

  /**
   * 포트 생성
   */
  async create(equipmentId: string, input: CreatePortInput): Promise<PortDetail> {
    const equipment = await prisma.equipment.findUnique({
      where: { id: equipmentId },
    });

    if (!equipment) {
      throw new NotFoundError('설비');
    }

    // 동일 설비 내 포트 이름 중복 확인
    const existing = await prisma.port.findFirst({
      where: {
        equipmentId,
        name: input.name,
      },
    });

    if (existing) {
      throw new ConflictError('동일한 이름의 포트가 이미 존재합니다.');
    }

    const port = await prisma.port.create({
      data: {
        equipmentId,
        name: input.name,
        portType: input.portType,
        portNumber: input.portNumber,
        label: input.label,
        speed: input.speed,
        connectorType: input.connectorType,
        description: input.description,
      },
    });

    return {
      id: port.id,
      equipmentId: port.equipmentId,
      name: port.name,
      portType: port.portType,
      portNumber: port.portNumber,
      label: port.label,
      speed: port.speed,
      connectorType: port.connectorType,
      description: port.description,
      sortOrder: port.sortOrder,
      isConnected: false,
      createdAt: port.createdAt,
      updatedAt: port.updatedAt,
    };
  }

  /**
   * 포트 일괄 생성
   */
  async createBulk(equipmentId: string, inputs: CreatePortInput[]): Promise<PortDetail[]> {
    const equipment = await prisma.equipment.findUnique({
      where: { id: equipmentId },
    });

    if (!equipment) {
      throw new NotFoundError('설비');
    }

    // 중복 이름 확인
    const existingPorts = await prisma.port.findMany({
      where: { equipmentId },
      select: { name: true },
    });
    const existingNames = new Set(existingPorts.map((p) => p.name));

    for (const input of inputs) {
      if (existingNames.has(input.name)) {
        throw new ConflictError(`동일한 이름의 포트가 이미 존재합니다: ${input.name}`);
      }
    }

    // 입력값 내 중복 확인
    const inputNames = inputs.map((i) => i.name);
    if (new Set(inputNames).size !== inputNames.length) {
      throw new ConflictError('입력된 포트 이름에 중복이 있습니다.');
    }

    await prisma.port.createMany({
      data: inputs.map((input, index) => ({
        equipmentId,
        name: input.name,
        portType: input.portType,
        portNumber: input.portNumber,
        label: input.label,
        speed: input.speed,
        connectorType: input.connectorType,
        description: input.description,
        sortOrder: index,
      })),
    });

    return this.getByEquipmentId(equipmentId);
  }

  /**
   * 포트 수정
   */
  async update(id: string, input: UpdatePortInput): Promise<PortDetail> {
    const existing = await prisma.port.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('포트');
    }

    // 이름 변경 시 중복 확인
    if (input.name && input.name !== existing.name) {
      const nameExists = await prisma.port.findFirst({
        where: {
          equipmentId: existing.equipmentId,
          name: input.name,
          id: { not: id },
        },
      });

      if (nameExists) {
        throw new ConflictError('동일한 이름의 포트가 이미 존재합니다.');
      }
    }

    const port = await prisma.port.update({
      where: { id },
      data: {
        name: input.name,
        portType: input.portType,
        portNumber: input.portNumber,
        label: input.label,
        speed: input.speed,
        connectorType: input.connectorType,
        description: input.description,
        sortOrder: input.sortOrder,
      },
      include: {
        sourceCables: { select: { id: true } },
        targetCables: { select: { id: true } },
      },
    });

    return {
      id: port.id,
      equipmentId: port.equipmentId,
      name: port.name,
      portType: port.portType,
      portNumber: port.portNumber,
      label: port.label,
      speed: port.speed,
      connectorType: port.connectorType,
      description: port.description,
      sortOrder: port.sortOrder,
      isConnected: port.sourceCables.length > 0 || port.targetCables.length > 0,
      createdAt: port.createdAt,
      updatedAt: port.updatedAt,
    };
  }

  /**
   * 포트 삭제
   */
  async delete(id: string): Promise<void> {
    const port = await prisma.port.findUnique({
      where: { id },
      include: {
        sourceCables: true,
        targetCables: true,
      },
    });

    if (!port) {
      throw new NotFoundError('포트');
    }

    // 연결된 케이블 확인
    const connectionCount = port.sourceCables.length + port.targetCables.length;
    if (connectionCount > 0) {
      throw new ConflictError(
        `연결된 케이블이 ${connectionCount}개 있어 삭제할 수 없습니다. 케이블을 먼저 제거하세요.`
      );
    }

    await prisma.port.delete({
      where: { id },
    });
  }
}

export const portService = new PortService();
