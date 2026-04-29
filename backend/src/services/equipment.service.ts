import prisma from '../config/prisma.js';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors.js';
import { EquipmentCategory, Prisma } from '@prisma/client';

// ==================== Types ====================

export interface EquipmentDetail {
  id: string;
  parentEquipmentId: string | null;
  floorId: string | null;
  name: string;
  model: string | null;
  manufacturer: string | null;
  serialNumber: string | null;
  startU: number | null;
  heightU: number;
  totalU: number | null;
  positionX: number | null;
  positionY: number | null;
  width2d: number | null;
  height2d: number | null;
  rotation: number | null;
  height3d: number | null;
  frontImageUrl: string | null;
  rearImageUrl: string | null;
  category: EquipmentCategory;
  installDate: Date | null;
  manager: string | null;
  description: string | null;
  properties: unknown;
  materialCategoryId: string | null;
  materialCategoryCode: string | null;
  displayColor: string | null;
  materialId: string | null;
  specParams: unknown;
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
  materialCategoryId?: string;
  specParams?: unknown;
}

export interface CreateFloorPlanEquipmentInput {
  name: string;
  model?: string;
  manufacturer?: string;
  serialNumber?: string;
  positionX: number;
  positionY: number;
  width2d?: number;
  height2d?: number;
  rotation?: number;
  heightU?: number;
  totalU?: number;
  height3d?: number;
  category?: EquipmentCategory;
  installDate?: string;
  manager?: string;
  description?: string;
  properties?: unknown;
  materialCategoryId?: string;
  specParams?: unknown;
}

export interface UpdateEquipmentInput {
  name?: string;
  model?: string;
  manufacturer?: string;
  serialNumber?: string;
  startU?: number;
  heightU?: number;
  positionX?: number;
  positionY?: number;
  width2d?: number;
  height2d?: number;
  rotation?: number;
  height3d?: number;
  frontImageUrl?: string;
  rearImageUrl?: string;
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
   * Equipment 엔티티를 EquipmentDetail로 매핑
   */
  private mapToDetail(e: {
    id: string;
    parentEquipmentId: string | null;
    floorId: string | null;
    name: string;
    model: string | null;
    manufacturer: string | null;
    serialNumber: string | null;
    startU: number | null;
    heightU: number;
    totalU: number | null;
    positionX: number | null;
    positionY: number | null;
    width2d: number | null;
    height2d: number | null;
    rotation: number | null;
    height3d: number | null;
    frontImageUrl: string | null;
    rearImageUrl: string | null;
    category: EquipmentCategory;
    installDate: Date | null;
    manager: string | null;
    description: string | null;
    properties: unknown;
    materialCategoryId: string | null;
    materialCategory?: { code: string; displayColor: string | null } | null;
    materialId: string | null;
    specParams: unknown;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
    _count: { ports: number };
  }): EquipmentDetail {
    return {
      id: e.id,
      parentEquipmentId: e.parentEquipmentId,
      floorId: e.floorId,
      name: e.name,
      model: e.model,
      manufacturer: e.manufacturer,
      serialNumber: e.serialNumber,
      startU: e.startU,
      heightU: e.heightU,
      totalU: e.totalU,
      positionX: e.positionX,
      positionY: e.positionY,
      width2d: e.width2d,
      height2d: e.height2d,
      rotation: e.rotation,
      height3d: e.height3d,
      frontImageUrl: e.frontImageUrl,
      rearImageUrl: e.rearImageUrl,
      category: e.category,
      installDate: e.installDate,
      manager: e.manager,
      description: e.description,
      properties: e.properties,
      materialCategoryId: e.materialCategoryId,
      materialCategoryCode: e.materialCategory?.code ?? null,
      displayColor: e.materialCategory?.displayColor ?? null,
      materialId: e.materialId,
      specParams: e.specParams,
      sortOrder: e.sortOrder,
      portCount: e._count.ports,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }

  /**
   * 설비 목록 조회 (카테고리 필터 지원)
   */
  async getAll(filters?: { category?: EquipmentCategory }): Promise<(EquipmentDetail & { substationName?: string })[]> {
    const where: Record<string, unknown> = {};
    if (filters?.category) {
      where.category = filters.category;
    }

    const equipment = await prisma.equipment.findMany({
      where,
      include: {
        _count: { select: { ports: true } },
        materialCategory: { select: { code: true, displayColor: true } },
        floor: {
          include: {
            substation: { select: { name: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return equipment.map((e) => ({
      ...this.mapToDetail(e),
      substationName: e.floor?.substation?.name ?? undefined,
    }));
  }

  /**
   * 부모 EQP-RACK 설비 내의 모든 자식 설비 조회
   */
  async getByParentId(parentEquipmentId: string): Promise<EquipmentDetail[]> {
    const parent = await prisma.equipment.findUnique({
      where: { id: parentEquipmentId },
    });

    if (!parent) {
      throw new NotFoundError('상위 설비');
    }

    const equipment = await prisma.equipment.findMany({
      where: { parentEquipmentId },
      include: {
        _count: {
          select: { ports: true },
        },
        materialCategory: { select: { code: true, displayColor: true } },
      },
      orderBy: [{ startU: 'desc' }, { sortOrder: 'asc' }],
    });

    return equipment.map((e) => this.mapToDetail(e));
  }

  /**
   * 실(Room)에 직접 배치된 설비 조회
   */
  async getByFloorId(floorId: string): Promise<EquipmentDetail[]> {
    const floor = await prisma.floor.findUnique({
      where: { id: floorId },
    });

    if (!floor) {
      throw new NotFoundError('층');
    }

    const equipment = await prisma.equipment.findMany({
      where: { floorId },
      include: {
        _count: {
          select: { ports: true },
        },
        materialCategory: { select: { code: true, displayColor: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });

    return equipment.map((e) => this.mapToDetail(e));
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
        materialCategory: { select: { code: true, displayColor: true } },
      },
    });

    if (!equipment) {
      throw new NotFoundError('설비');
    }

    return this.mapToDetail(equipment);
  }

  /**
   * U 슬롯 충돌 검사 (랙 자식 설비 대상)
   */
  private async checkUSlotConflict(
    parentEquipmentId: string,
    startU: number,
    heightU: number,
    excludeEquipmentId?: string
  ): Promise<{ hasConflict: boolean; conflictingEquipment?: { name: string; startU: number | null; heightU: number } }> {
    const endU = startU + heightU - 1;

    const equipmentList = await prisma.equipment.findMany({
      where: {
        parentEquipmentId,
        id: excludeEquipmentId ? { not: excludeEquipmentId } : undefined,
      },
      select: {
        name: true,
        startU: true,
        heightU: true,
      },
    });

    for (const e of equipmentList) {
      if (e.startU === null) continue;
      const eEndU = e.startU + e.heightU - 1;
      if (!(endU < e.startU || startU > eEndU)) {
        return {
          hasConflict: true,
          conflictingEquipment: e,
        };
      }
    }

    return { hasConflict: false };
  }

  /**
   * U 범위 유효성 검사 (부모 EQP-RACK의 totalU 기준)
   */
  private async validateURange(parentEquipmentId: string, startU: number, heightU: number): Promise<void> {
    const parent = await prisma.equipment.findUnique({
      where: { id: parentEquipmentId },
      select: { totalU: true },
    });

    if (!parent) {
      throw new NotFoundError('상위 설비');
    }

    if (startU < 1) {
      throw new ValidationError('시작 U 위치는 1 이상이어야 합니다.');
    }

    if (heightU < 1) {
      throw new ValidationError('높이는 1U 이상이어야 합니다.');
    }

    const totalU = parent.totalU ?? 42;
    const endU = startU + heightU - 1;
    if (endU > totalU) {
      throw new ValidationError(
        `설비가 랙 범위를 초과합니다. (랙 총 U: ${totalU}, 설비 종료 U: ${endU})`
      );
    }
  }

  /**
   * 랙 자식 설비 생성
   */
  async create(
    parentEquipmentId: string,
    input: CreateEquipmentInput,
    userId: string
  ): Promise<EquipmentDetail> {
    const parent = await prisma.equipment.findUnique({
      where: { id: parentEquipmentId },
    });

    if (!parent) {
      throw new NotFoundError('상위 설비');
    }

    const heightU = input.heightU ?? 1;

    await this.validateURange(parentEquipmentId, input.startU, heightU);

    const { hasConflict, conflictingEquipment } = await this.checkUSlotConflict(
      parentEquipmentId,
      input.startU,
      heightU
    );

    if (hasConflict && conflictingEquipment) {
      throw new ConflictError(
        `해당 U 슬롯에 이미 설비가 있습니다. (${conflictingEquipment.name}: ${conflictingEquipment.startU ?? 0}U~${(conflictingEquipment.startU ?? 0) + conflictingEquipment.heightU - 1}U)`
      );
    }

    const equipment = await prisma.equipment.create({
      data: {
        parentEquipmentId,
        floorId: parent.floorId,
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
        materialCategoryId: input.materialCategoryId,
        specParams: input.specParams != null ? (input.specParams as Prisma.InputJsonValue) : undefined,
        createdById: userId,
        updatedById: userId,
      },
      include: {
        _count: {
          select: { ports: true },
        },
        materialCategory: { select: { code: true, displayColor: true } },
      },
    });

    return this.mapToDetail(equipment);
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

    const newStartU = input.startU ?? existing.startU ?? 1;
    const newHeightU = input.heightU ?? existing.heightU;

    if (existing.parentEquipmentId && (input.startU !== undefined || input.heightU !== undefined)) {
      await this.validateURange(existing.parentEquipmentId, newStartU, newHeightU);

      const { hasConflict, conflictingEquipment } = await this.checkUSlotConflict(
        existing.parentEquipmentId,
        newStartU,
        newHeightU,
        id
      );

      if (hasConflict && conflictingEquipment) {
        throw new ConflictError(
          `해당 U 슬롯에 이미 설비가 있습니다. (${conflictingEquipment.name}: ${conflictingEquipment.startU}U~${(conflictingEquipment.startU ?? 0) + conflictingEquipment.heightU - 1}U)`
        );
      }
    }

    if (input.category === 'OFD' && existing.category !== 'OFD' && existing.floorId) {
      await this.validateOfdUniqueness(existing.floorId, id);
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
        positionX: input.positionX,
        positionY: input.positionY,
        width2d: input.width2d,
        height2d: input.height2d,
        rotation: input.rotation,
        height3d: input.height3d,
        frontImageUrl: input.frontImageUrl,
        rearImageUrl: input.rearImageUrl,
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
        materialCategory: { select: { code: true, displayColor: true } },
      },
    });

    return this.mapToDetail(equipment);
  }

  /**
   * 설비 이동 (U 위치 변경, 랙 자식 설비 대상)
   */
  async move(id: string, input: MoveEquipmentInput, userId: string): Promise<EquipmentDetail> {
    const existing = await prisma.equipment.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('설비');
    }

    if (!existing.parentEquipmentId) {
      throw new ValidationError('랙에 배치된 설비만 U 위치를 이동할 수 있습니다.');
    }

    await this.validateURange(existing.parentEquipmentId, input.startU, existing.heightU);

    const { hasConflict, conflictingEquipment } = await this.checkUSlotConflict(
      existing.parentEquipmentId,
      input.startU,
      existing.heightU,
      id
    );

    if (hasConflict && conflictingEquipment) {
      throw new ConflictError(
        `해당 U 슬롯에 이미 설비가 있습니다. (${conflictingEquipment.name}: ${conflictingEquipment.startU}U~${(conflictingEquipment.startU ?? 0) + conflictingEquipment.heightU - 1}U)`
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
        materialCategory: { select: { code: true, displayColor: true } },
      },
    });

    return this.mapToDetail(equipment);
  }

  /**
   * 변전소 내 OFD 중복 검사 (변전소당 OFD 1개만 허용)
   */
  async validateOfdUniqueness(floorId: string, excludeEquipmentId?: string): Promise<void> {
    const floor = await prisma.floor.findUnique({
      where: { id: floorId },
      include: { substation: { select: { name: true } } },
    });
    if (!floor) return;

    const substationId = floor.substationId;
    const existingOfd = await prisma.equipment.findFirst({
      where: {
        category: 'OFD',
        id: excludeEquipmentId ? { not: excludeEquipmentId } : undefined,
        floor: { substationId },
      },
      select: { id: true, name: true },
    });

    if (existingOfd) {
      throw new ConflictError(
        `${floor.substation?.name ?? ''} 변전소에 이미 OFD가 존재합니다. (${existingOfd.name})`
      );
    }
  }

  /**
   * 평면도(Room)에 직접 배치하는 설비 생성
   */
  async createOnFloorPlan(
    floorId: string,
    input: CreateFloorPlanEquipmentInput,
    userId: string
  ): Promise<EquipmentDetail> {
    const floor = await prisma.floor.findUnique({
      where: { id: floorId },
    });

    if (!floor) {
      throw new NotFoundError('층');
    }

    if (input.category === 'OFD') {
      await this.validateOfdUniqueness(floorId);
    }

    const equipment = await prisma.equipment.create({
      data: {
        floorId,
        name: input.name,
        model: input.model,
        manufacturer: input.manufacturer,
        serialNumber: input.serialNumber,
        positionX: input.positionX,
        positionY: input.positionY,
        width2d: input.width2d,
        height2d: input.height2d,
        rotation: input.rotation ?? 0,
        heightU: input.heightU ?? 1,
        totalU: input.totalU,
        height3d: input.height3d,
        category: input.category ?? 'OTHER',
        installDate: input.installDate ? new Date(input.installDate) : null,
        manager: input.manager,
        description: input.description,
        properties: (input.properties ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        materialCategoryId: input.materialCategoryId,
        specParams: input.specParams != null ? (input.specParams as Prisma.InputJsonValue) : undefined,
        createdById: userId,
        updatedById: userId,
      },
      include: {
        _count: {
          select: { ports: true },
        },
        materialCategory: { select: { code: true, displayColor: true } },
      },
    });

    return this.mapToDetail(equipment);
  }

  /**
   * 설비 삭제
   */
  async delete(id: string): Promise<void> {
    const equipment = await prisma.equipment.findUnique({
      where: { id },
      include: {
        sourceCables: { select: { id: true } },
        targetCables: { select: { id: true } },
      },
    });

    if (!equipment) {
      throw new NotFoundError('설비');
    }

    const connectionCount = equipment.sourceCables.length + equipment.targetCables.length;
    if (connectionCount > 0) {
      throw new ConflictError(
        `연결된 케이블이 ${connectionCount}개 있어 삭제할 수 없습니다. 케이블을 먼저 제거하세요.`
      );
    }

    await prisma.equipment.delete({
      where: { id },
    });
  }

  /**
   * 부모 EQP-RACK 설비의 사용 가능한 U 슬롯 조회
   */
  async getAvailableSlots(parentEquipmentId: string): Promise<{ start: number; end: number }[]> {
    const parent = await prisma.equipment.findUnique({
      where: { id: parentEquipmentId },
      select: { totalU: true },
    });

    if (!parent) {
      throw new NotFoundError('상위 설비');
    }

    const equipment = await prisma.equipment.findMany({
      where: { parentEquipmentId },
      orderBy: { startU: 'asc' },
    });

    const usedSlots = new Set<number>();
    for (const e of equipment) {
      if (e.startU === null) continue;
      for (let u = e.startU; u < e.startU + e.heightU; u++) {
        usedSlots.add(u);
      }
    }

    const availableRanges: { start: number; end: number }[] = [];
    let rangeStart: number | null = null;

    const totalU = parent.totalU ?? 42;
    for (let u = 1; u <= totalU; u++) {
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

    if (rangeStart !== null) {
      availableRanges.push({ start: rangeStart, end: totalU });
    }

    return availableRanges;
  }

  /**
   * 설비 이미지 업데이트
   */
  async updateImage(id: string, imageType: 'front' | 'rear', imageUrl: string, userId: string) {
    const existing = await prisma.equipment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('설비');

    return prisma.equipment.update({
      where: { id },
      data: {
        ...(imageType === 'front' ? { frontImageUrl: imageUrl } : { rearImageUrl: imageUrl }),
        updatedById: userId,
      },
    });
  }

  /**
   * 설비 이미지 삭제
   */
  async deleteImage(id: string, imageType: 'front' | 'rear', userId: string) {
    const existing = await prisma.equipment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('설비');

    return prisma.equipment.update({
      where: { id },
      data: {
        ...(imageType === 'front' ? { frontImageUrl: null } : { rearImageUrl: null }),
        updatedById: userId,
      },
    });
  }
}

export const equipmentService = new EquipmentService();
