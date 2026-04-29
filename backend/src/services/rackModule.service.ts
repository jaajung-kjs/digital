import prisma from '../config/prisma.js';
import { Prisma, EquipmentKind } from '@prisma/client';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors.js';

// ==================== Types ====================

export interface RackModuleDetail {
  id: string;
  rackEquipmentId: string;
  categoryId: string;
  categoryCode: string | null;
  categoryName: string | null;
  categoryDisplayColor: string | null;
  name: string;
  startU: number;
  heightU: number;
  installDate: Date | null;
  manager: string | null;
  description: string | null;
  properties: unknown;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRackModuleInput {
  rackEquipmentId: string;
  categoryId: string;
  name: string;
  startU: number;
  heightU: number;
  installDate?: string | null;
  manager?: string | null;
  description?: string | null;
  properties?: unknown;
  sortOrder?: number;
}

export interface UpdateRackModuleInput {
  name?: string;
  startU?: number;
  heightU?: number;
  installDate?: string | null;
  manager?: string | null;
  description?: string | null;
  properties?: unknown;
  sortOrder?: number;
}

// ==================== Helpers ====================

const moduleInclude = {
  category: {
    select: {
      id: true,
      code: true,
      name: true,
      displayColor: true,
    },
  },
} as const;

interface ExistingModuleSlot {
  id: string;
  startU: number;
  heightU: number;
}

/**
 * 슬롯 충돌 검사. start..start+height-1 이 다른 모듈과 겹치면 ConflictError.
 *
 * `excludeModuleId`: update 경로에서 자기 자신을 제외할 때.
 */
function assertNoSlotCollision(
  startU: number,
  heightU: number,
  totalU: number,
  existing: ExistingModuleSlot[],
  excludeModuleId?: string,
): void {
  if (startU < 1) {
    throw new ValidationError(`startU 는 1 이상이어야 합니다 (입력값: ${startU}).`);
  }
  if (heightU < 1) {
    throw new ValidationError(`heightU 는 1 이상이어야 합니다 (입력값: ${heightU}).`);
  }
  const endU = startU + heightU - 1;
  if (endU > totalU) {
    throw new ValidationError(
      `랙 용량 초과: ${startU}U + ${heightU}U = ${endU}U (랙 totalU = ${totalU}).`,
    );
  }
  for (const m of existing) {
    if (excludeModuleId && m.id === excludeModuleId) continue;
    const mEnd = m.startU + m.heightU - 1;
    if (startU <= mEnd && endU >= m.startU) {
      throw new ConflictError(
        `슬롯 충돌: ${startU}U-${endU}U 가 기존 모듈 (${m.startU}U-${mEnd}U) 과 겹칩니다.`,
      );
    }
  }
}

// ==================== Service ====================

class RackModuleService {
  private mapToDetail(m: {
    id: string;
    rackEquipmentId: string;
    categoryId: string;
    name: string;
    startU: number;
    heightU: number;
    installDate: Date | null;
    manager: string | null;
    description: string | null;
    properties: unknown;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
    category?: { code: string; name: string; displayColor: string | null } | null;
  }): RackModuleDetail {
    return {
      id: m.id,
      rackEquipmentId: m.rackEquipmentId,
      categoryId: m.categoryId,
      categoryCode: m.category?.code ?? null,
      categoryName: m.category?.name ?? null,
      categoryDisplayColor: m.category?.displayColor ?? null,
      name: m.name,
      startU: m.startU,
      heightU: m.heightU,
      installDate: m.installDate,
      manager: m.manager,
      description: m.description,
      properties: m.properties,
      sortOrder: m.sortOrder,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    };
  }

  async getByRackId(rackId: string): Promise<RackModuleDetail[]> {
    const rack = await prisma.equipment.findUnique({
      where: { id: rackId },
      select: { id: true, kind: true },
    });
    if (!rack) throw new NotFoundError('랙 설비');
    if (rack.kind !== EquipmentKind.RACK) {
      throw new ValidationError(
        `해당 설비는 RACK 이 아닙니다 (kind=${rack.kind}). 랙 모듈은 RACK 설비에만 속합니다.`,
      );
    }
    const modules = await prisma.rackModule.findMany({
      where: { rackEquipmentId: rackId },
      include: moduleInclude,
      orderBy: [{ startU: 'asc' }, { createdAt: 'asc' }],
    });
    return modules.map((m) => this.mapToDetail(m));
  }

  async getById(id: string): Promise<RackModuleDetail> {
    const module = await prisma.rackModule.findUnique({
      where: { id },
      include: moduleInclude,
    });
    if (!module) throw new NotFoundError('랙 모듈');
    return this.mapToDetail(module);
  }

  async create(input: CreateRackModuleInput, userId: string): Promise<RackModuleDetail> {
    // 1) 부모 랙 검증
    const rack = await prisma.equipment.findUnique({
      where: { id: input.rackEquipmentId },
      select: { id: true, kind: true, totalU: true },
    });
    if (!rack) throw new NotFoundError('부모 랙 설비');
    if (rack.kind !== EquipmentKind.RACK) {
      throw new ValidationError(
        `부모 설비가 RACK 이 아닙니다 (kind=${rack.kind}). 랙 모듈은 RACK 설비에만 속합니다.`,
      );
    }
    const totalU = rack.totalU ?? 42;

    // 2) 카테고리 검증
    const category = await prisma.rackModuleCategory.findUnique({
      where: { id: input.categoryId },
      select: { id: true },
    });
    if (!category) throw new NotFoundError('랙 모듈 카테고리');

    // 3) 슬롯 충돌
    const existing = await prisma.rackModule.findMany({
      where: { rackEquipmentId: rack.id },
      select: { id: true, startU: true, heightU: true },
    });
    assertNoSlotCollision(input.startU, input.heightU, totalU, existing);

    // 4) Create
    const created = await prisma.rackModule.create({
      data: {
        rackEquipmentId: rack.id,
        categoryId: category.id,
        name: input.name,
        startU: input.startU,
        heightU: input.heightU,
        installDate: input.installDate ? new Date(input.installDate) : null,
        manager: input.manager ?? null,
        description: input.description ?? null,
        properties: (input.properties ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        sortOrder: input.sortOrder ?? 0,
        createdById: userId,
        updatedById: userId,
      },
      include: moduleInclude,
    });
    return this.mapToDetail(created);
  }

  async update(
    id: string,
    input: UpdateRackModuleInput,
    userId: string,
  ): Promise<RackModuleDetail> {
    const existing = await prisma.rackModule.findUnique({
      where: { id },
      select: {
        id: true,
        rackEquipmentId: true,
        startU: true,
        heightU: true,
        rack: { select: { totalU: true, kind: true } },
      },
    });
    if (!existing) throw new NotFoundError('랙 모듈');

    // 슬롯 변경이 있으면 충돌 재검사
    const newStartU = input.startU ?? existing.startU;
    const newHeightU = input.heightU ?? existing.heightU;
    if (input.startU !== undefined || input.heightU !== undefined) {
      const totalU = existing.rack.totalU ?? 42;
      const siblings = await prisma.rackModule.findMany({
        where: { rackEquipmentId: existing.rackEquipmentId },
        select: { id: true, startU: true, heightU: true },
      });
      assertNoSlotCollision(newStartU, newHeightU, totalU, siblings, id);
    }

    const updated = await prisma.rackModule.update({
      where: { id },
      data: {
        name: input.name,
        startU: input.startU,
        heightU: input.heightU,
        installDate:
          input.installDate !== undefined
            ? input.installDate
              ? new Date(input.installDate)
              : null
            : undefined,
        manager: input.manager,
        description: input.description,
        properties: input.properties as Prisma.InputJsonValue | undefined,
        sortOrder: input.sortOrder,
        updatedById: userId,
      },
      include: moduleInclude,
    });
    return this.mapToDetail(updated);
  }

  async delete(id: string): Promise<void> {
    const existing = await prisma.rackModule.findUnique({
      where: { id },
      include: {
        sourceCables: { select: { id: true } },
        targetCables: { select: { id: true } },
      },
    });
    if (!existing) throw new NotFoundError('랙 모듈');

    const connectionCount = existing.sourceCables.length + existing.targetCables.length;
    if (connectionCount > 0) {
      throw new ConflictError(
        `연결된 케이블이 ${connectionCount}개 있어 삭제할 수 없습니다. 케이블을 먼저 제거하세요.`,
      );
    }

    await prisma.rackModule.delete({ where: { id } });
  }
}

export const rackModuleService = new RackModuleService();
export { assertNoSlotCollision };
