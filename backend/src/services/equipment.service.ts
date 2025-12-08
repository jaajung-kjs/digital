import prisma from '../config/prisma.js';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors.js';
import { EquipmentCategory, Prisma } from '@prisma/client';

// ==================== Types ====================

export interface EquipmentDetail {
  id: string;
  rackId: string;
  name: string;
  model: string | null;
  manufacturer: string | null;
  serialNumber: string | null;
  startU: number;
  heightU: number;
  category: EquipmentCategory;
  installDate: Date | null;
  manager: string | null;
  description: string | null;
  properties: unknown;
  sortOrder: number;
  portCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateEquipmentInput {
  name: string;
  model?: string;
  manufacturer?: string;
  serialNumber?: string;
  startU: number;
  heightU?: number;
  category?: EquipmentCategory;
  installDate?: string;
  manager?: string;
  description?: string;
  properties?: unknown;
}

export interface UpdateEquipmentInput {
  name?: string;
  model?: string;
  manufacturer?: string;
  serialNumber?: string;
  startU?: number;
  heightU?: number;
  category?: EquipmentCategory;
  installDate?: string;
  manager?: string;
  description?: string;
  properties?: unknown;
  sortOrder?: number;
}

export interface MoveEquipmentInput {
  startU: number;
}

// ==================== Service ====================

class EquipmentService {
  /**
   * 랙 내 모든 설비 조회
   */
  async getByRackId(rackId: string): Promise<EquipmentDetail[]> {
    const rack = await prisma.rack.findUnique({
      where: { id: rackId },
    });

    if (!rack) {
      throw new NotFoundError('랙');
    }

    const equipment = await prisma.equipment.findMany({
      where: { rackId },
      include: {
        _count: {
          select: { ports: true },
        },
      },
      orderBy: [{ startU: 'desc' }, { sortOrder: 'asc' }],
    });

    return equipment.map((e) => ({
      id: e.id,
      rackId: e.rackId,
      name: e.name,
      model: e.model,
      manufacturer: e.manufacturer,
      serialNumber: e.serialNumber,
      startU: e.startU,
      heightU: e.heightU,
      category: e.category,
      installDate: e.installDate,
      manager: e.manager,
      description: e.description,
      properties: e.properties,
      sortOrder: e.sortOrder,
      portCount: e._count.ports,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }));
  }

  /**
   * 설비 상세 조회
   */
  async getById(id: string): Promise<EquipmentDetail> {
    const equipment = await prisma.equipment.findUnique({
      where: { id },
      include: {
        _count: {
          select: { ports: true },
        },
      },
    });

    if (!equipment) {
      throw new NotFoundError('설비');
    }

    return {
      id: equipment.id,
      rackId: equipment.rackId,
      name: equipment.name,
      model: equipment.model,
      manufacturer: equipment.manufacturer,
      serialNumber: equipment.serialNumber,
      startU: equipment.startU,
      heightU: equipment.heightU,
      category: equipment.category,
      installDate: equipment.installDate,
      manager: equipment.manager,
      description: equipment.description,
      properties: equipment.properties,
      sortOrder: equipment.sortOrder,
      portCount: equipment._count.ports,
      createdAt: equipment.createdAt,
      updatedAt: equipment.updatedAt,
    };
  }

  /**
   * U 슬롯 충돌 검사
   */
  private async checkUSlotConflict(
    rackId: string,
    startU: number,
    heightU: number,
    excludeEquipmentId?: string
  ): Promise<{ hasConflict: boolean; conflictingEquipment?: EquipmentDetail }> {
    const endU = startU + heightU - 1;

    // 해당 랙의 모든 설비 조회
    const equipmentList = await prisma.equipment.findMany({
      where: {
        rackId,
        id: excludeEquipmentId ? { not: excludeEquipmentId } : undefined,
      },
      include: {
        _count: {
          select: { ports: true },
        },
      },
    });

    // 슬롯 충돌 검사
    for (const e of equipmentList) {
      const eEndU = e.startU + e.heightU - 1;
      // 겹침 조건: NOT (endU < e.startU OR startU > eEndU)
      if (!(endU < e.startU || startU > eEndU)) {
        return {
          hasConflict: true,
          conflictingEquipment: {
            id: e.id,
            rackId: e.rackId,
            name: e.name,
            model: e.model,
            manufacturer: e.manufacturer,
            serialNumber: e.serialNumber,
            startU: e.startU,
            heightU: e.heightU,
            category: e.category,
            installDate: e.installDate,
            manager: e.manager,
            description: e.description,
            properties: e.properties,
            sortOrder: e.sortOrder,
            portCount: e._count.ports,
            createdAt: e.createdAt,
            updatedAt: e.updatedAt,
          },
        };
      }
    }

    return { hasConflict: false };
  }

  /**
   * U 범위 유효성 검사
   */
  private async validateURange(rackId: string, startU: number, heightU: number): Promise<void> {
    const rack = await prisma.rack.findUnique({
      where: { id: rackId },
    });

    if (!rack) {
      throw new NotFoundError('랙');
    }

    if (startU < 1) {
      throw new ValidationError('시작 U 위치는 1 이상이어야 합니다.');
    }

    if (heightU < 1) {
      throw new ValidationError('높이는 1U 이상이어야 합니다.');
    }

    const endU = startU + heightU - 1;
    if (endU > rack.totalU) {
      throw new ValidationError(
        `설비가 랙 범위를 초과합니다. (랙 총 U: ${rack.totalU}, 설비 종료 U: ${endU})`
      );
    }
  }

  /**
   * 설비 생성
   */
  async create(
    rackId: string,
    input: CreateEquipmentInput,
    userId: string
  ): Promise<EquipmentDetail> {
    const rack = await prisma.rack.findUnique({
      where: { id: rackId },
    });

    if (!rack) {
      throw new NotFoundError('랙');
    }

    const heightU = input.heightU ?? 1;

    // U 범위 유효성 검사
    await this.validateURange(rackId, input.startU, heightU);

    // U 슬롯 충돌 검사
    const { hasConflict, conflictingEquipment } = await this.checkUSlotConflict(
      rackId,
      input.startU,
      heightU
    );

    if (hasConflict && conflictingEquipment) {
      throw new ConflictError(
        `해당 U 슬롯에 이미 설비가 있습니다. (${conflictingEquipment.name}: ${conflictingEquipment.startU}U~${conflictingEquipment.startU + conflictingEquipment.heightU - 1}U)`
      );
    }

    const equipment = await prisma.equipment.create({
      data: {
        rackId,
        name: input.name,
        model: input.model,
        manufacturer: input.manufacturer,
        serialNumber: input.serialNumber,
        startU: input.startU,
        heightU,
        category: input.category ?? 'OTHER',
        installDate: input.installDate ? new Date(input.installDate) : null,
        manager: input.manager,
        description: input.description,
        properties: (input.properties ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        createdById: userId,
        updatedById: userId,
      },
    });

    return {
      id: equipment.id,
      rackId: equipment.rackId,
      name: equipment.name,
      model: equipment.model,
      manufacturer: equipment.manufacturer,
      serialNumber: equipment.serialNumber,
      startU: equipment.startU,
      heightU: equipment.heightU,
      category: equipment.category,
      installDate: equipment.installDate,
      manager: equipment.manager,
      description: equipment.description,
      properties: equipment.properties,
      sortOrder: equipment.sortOrder,
      portCount: 0,
      createdAt: equipment.createdAt,
      updatedAt: equipment.updatedAt,
    };
  }

  /**
   * 설비 수정
   */
  async update(
    id: string,
    input: UpdateEquipmentInput,
    userId: string
  ): Promise<EquipmentDetail> {
    const existing = await prisma.equipment.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('설비');
    }

    const newStartU = input.startU ?? existing.startU;
    const newHeightU = input.heightU ?? existing.heightU;

    // U 위치가 변경된 경우 검사
    if (input.startU !== undefined || input.heightU !== undefined) {
      await this.validateURange(existing.rackId, newStartU, newHeightU);

      const { hasConflict, conflictingEquipment } = await this.checkUSlotConflict(
        existing.rackId,
        newStartU,
        newHeightU,
        id
      );

      if (hasConflict && conflictingEquipment) {
        throw new ConflictError(
          `해당 U 슬롯에 이미 설비가 있습니다. (${conflictingEquipment.name}: ${conflictingEquipment.startU}U~${conflictingEquipment.startU + conflictingEquipment.heightU - 1}U)`
        );
      }
    }

    const equipment = await prisma.equipment.update({
      where: { id },
      data: {
        name: input.name,
        model: input.model,
        manufacturer: input.manufacturer,
        serialNumber: input.serialNumber,
        startU: input.startU,
        heightU: input.heightU,
        category: input.category,
        installDate: input.installDate !== undefined
          ? (input.installDate ? new Date(input.installDate) : null)
          : undefined,
        manager: input.manager,
        description: input.description,
        properties: input.properties as Prisma.InputJsonValue | undefined,
        sortOrder: input.sortOrder,
        updatedById: userId,
      },
      include: {
        _count: {
          select: { ports: true },
        },
      },
    });

    return {
      id: equipment.id,
      rackId: equipment.rackId,
      name: equipment.name,
      model: equipment.model,
      manufacturer: equipment.manufacturer,
      serialNumber: equipment.serialNumber,
      startU: equipment.startU,
      heightU: equipment.heightU,
      category: equipment.category,
      installDate: equipment.installDate,
      manager: equipment.manager,
      description: equipment.description,
      properties: equipment.properties,
      sortOrder: equipment.sortOrder,
      portCount: equipment._count.ports,
      createdAt: equipment.createdAt,
      updatedAt: equipment.updatedAt,
    };
  }

  /**
   * 설비 이동 (U 위치 변경)
   */
  async move(id: string, input: MoveEquipmentInput, userId: string): Promise<EquipmentDetail> {
    const existing = await prisma.equipment.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('설비');
    }

    // U 범위 유효성 검사
    await this.validateURange(existing.rackId, input.startU, existing.heightU);

    // U 슬롯 충돌 검사
    const { hasConflict, conflictingEquipment } = await this.checkUSlotConflict(
      existing.rackId,
      input.startU,
      existing.heightU,
      id
    );

    if (hasConflict && conflictingEquipment) {
      throw new ConflictError(
        `해당 U 슬롯에 이미 설비가 있습니다. (${conflictingEquipment.name}: ${conflictingEquipment.startU}U~${conflictingEquipment.startU + conflictingEquipment.heightU - 1}U)`
      );
    }

    const equipment = await prisma.equipment.update({
      where: { id },
      data: {
        startU: input.startU,
        updatedById: userId,
      },
      include: {
        _count: {
          select: { ports: true },
        },
      },
    });

    return {
      id: equipment.id,
      rackId: equipment.rackId,
      name: equipment.name,
      model: equipment.model,
      manufacturer: equipment.manufacturer,
      serialNumber: equipment.serialNumber,
      startU: equipment.startU,
      heightU: equipment.heightU,
      category: equipment.category,
      installDate: equipment.installDate,
      manager: equipment.manager,
      description: equipment.description,
      properties: equipment.properties,
      sortOrder: equipment.sortOrder,
      portCount: equipment._count.ports,
      createdAt: equipment.createdAt,
      updatedAt: equipment.updatedAt,
    };
  }

  /**
   * 설비 삭제
   */
  async delete(id: string): Promise<void> {
    const equipment = await prisma.equipment.findUnique({
      where: { id },
      include: {
        ports: {
          include: {
            sourceCables: true,
            targetCables: true,
          },
        },
      },
    });

    if (!equipment) {
      throw new NotFoundError('설비');
    }

    // 연결된 케이블 확인
    const hasConnections = equipment.ports.some(
      (p) => p.sourceCables.length > 0 || p.targetCables.length > 0
    );

    if (hasConnections) {
      const connectionCount = equipment.ports.reduce(
        (sum, p) => sum + p.sourceCables.length + p.targetCables.length,
        0
      );
      throw new ConflictError(
        `연결된 케이블이 ${connectionCount}개 있어 삭제할 수 없습니다. 케이블을 먼저 제거하세요.`
      );
    }

    await prisma.equipment.delete({
      where: { id },
    });
  }

  /**
   * 랙의 사용 가능한 U 슬롯 조회
   */
  async getAvailableSlots(rackId: string): Promise<{ start: number; end: number }[]> {
    const rack = await prisma.rack.findUnique({
      where: { id: rackId },
    });

    if (!rack) {
      throw new NotFoundError('랙');
    }

    const equipment = await prisma.equipment.findMany({
      where: { rackId },
      orderBy: { startU: 'asc' },
    });

    // 사용 중인 슬롯 계산
    const usedSlots = new Set<number>();
    for (const e of equipment) {
      for (let u = e.startU; u < e.startU + e.heightU; u++) {
        usedSlots.add(u);
      }
    }

    // 연속된 빈 슬롯 영역 찾기
    const availableRanges: { start: number; end: number }[] = [];
    let rangeStart: number | null = null;

    for (let u = 1; u <= rack.totalU; u++) {
      if (!usedSlots.has(u)) {
        if (rangeStart === null) {
          rangeStart = u;
        }
      } else {
        if (rangeStart !== null) {
          availableRanges.push({ start: rangeStart, end: u - 1 });
          rangeStart = null;
        }
      }
    }

    // 마지막 범위 처리
    if (rangeStart !== null) {
      availableRanges.push({ start: rangeStart, end: rack.totalU });
    }

    return availableRanges;
  }
}

export const equipmentService = new EquipmentService();
