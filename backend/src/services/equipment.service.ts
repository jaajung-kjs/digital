import prisma from '../config/prisma.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';
import { Prisma, EquipmentKind } from '@prisma/client';

// ==================== Types ====================

export interface EquipmentDetail {
  id: string;
  floorId: string;
  kind: EquipmentKind;
  name: string;
  positionX: number;
  positionY: number;
  width2d: number;
  height2d: number;
  rotation: number;
  totalU: number | null;
  installDate: Date | null;
  manager: string | null;
  description: string | null;
  properties: unknown;
  frontImageUrl: string | null;
  rearImageUrl: string | null;
  height3d: number | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFloorPlanEquipmentInput {
  kind: EquipmentKind;
  name: string;
  positionX: number;
  positionY: number;
  width2d: number;
  height2d: number;
  rotation?: number;
  totalU?: number | null;
  height3d?: number | null;
  installDate?: string;
  manager?: string;
  description?: string;
  properties?: unknown;
}

export interface UpdateEquipmentInput {
  kind?: EquipmentKind;
  name?: string;
  positionX?: number;
  positionY?: number;
  width2d?: number;
  height2d?: number;
  rotation?: number;
  totalU?: number | null;
  height3d?: number | null;
  frontImageUrl?: string | null;
  rearImageUrl?: string | null;
  installDate?: string | null;
  manager?: string | null;
  description?: string | null;
  properties?: unknown;
  sortOrder?: number;
}

// ==================== Service ====================

class EquipmentService {
  private mapToDetail(e: {
    id: string;
    floorId: string;
    kind: EquipmentKind;
    name: string;
    positionX: number;
    positionY: number;
    width2d: number;
    height2d: number;
    rotation: number;
    totalU: number | null;
    installDate: Date | null;
    manager: string | null;
    description: string | null;
    properties: unknown;
    frontImageUrl: string | null;
    rearImageUrl: string | null;
    height3d: number | null;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }): EquipmentDetail {
    return {
      id: e.id,
      floorId: e.floorId,
      kind: e.kind,
      name: e.name,
      positionX: e.positionX,
      positionY: e.positionY,
      width2d: e.width2d,
      height2d: e.height2d,
      rotation: e.rotation,
      totalU: e.totalU,
      installDate: e.installDate,
      manager: e.manager,
      description: e.description,
      properties: e.properties,
      frontImageUrl: e.frontImageUrl,
      rearImageUrl: e.rearImageUrl,
      height3d: e.height3d,
      sortOrder: e.sortOrder,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }

  /** 도면 객체 목록 조회 (kind 필터 지원). */
  async getAll(filters?: { kind?: EquipmentKind }): Promise<(EquipmentDetail & { substationName?: string })[]> {
    const where: Prisma.EquipmentWhereInput = {};
    if (filters?.kind) where.kind = filters.kind;

    const equipment = await prisma.equipment.findMany({
      where,
      include: {
        floor: { include: { substation: { select: { name: true } } } },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return equipment.map((e) => ({
      ...this.mapToDetail(e),
      substationName: e.floor?.substation?.name ?? undefined,
    }));
  }

  /** 도면(층)에 배치된 설비 조회 */
  async getByFloorId(floorId: string): Promise<EquipmentDetail[]> {
    const floor = await prisma.floor.findUnique({ where: { id: floorId } });
    if (!floor) throw new NotFoundError('층');

    const equipment = await prisma.equipment.findMany({
      where: { floorId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });

    return equipment.map((e) => this.mapToDetail(e));
  }

  async getById(id: string): Promise<EquipmentDetail> {
    const equipment = await prisma.equipment.findUnique({ where: { id } });
    if (!equipment) throw new NotFoundError('설비');
    return this.mapToDetail(equipment);
  }

  /** OFD 중복 검사 (변전소당 OFD 1개) */
  async validateOfdUniqueness(floorId: string, excludeEquipmentId?: string): Promise<void> {
    const floor = await prisma.floor.findUnique({
      where: { id: floorId },
      include: { substation: { select: { name: true } } },
    });
    if (!floor) return;

    const substationId = floor.substationId;
    const existingOfd = await prisma.equipment.findFirst({
      where: {
        kind: EquipmentKind.OFD,
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

  /** 도면(Floor)에 직접 배치하는 설비 생성 */
  async createOnFloorPlan(
    floorId: string,
    input: CreateFloorPlanEquipmentInput,
    userId: string
  ): Promise<EquipmentDetail> {
    const floor = await prisma.floor.findUnique({ where: { id: floorId } });
    if (!floor) throw new NotFoundError('층');

    if (input.kind === EquipmentKind.OFD) {
      await this.validateOfdUniqueness(floorId);
    }

    const equipment = await prisma.equipment.create({
      data: {
        floorId,
        kind: input.kind,
        name: input.name,
        positionX: input.positionX,
        positionY: input.positionY,
        width2d: input.width2d,
        height2d: input.height2d,
        rotation: input.rotation ?? 0,
        totalU: input.kind === EquipmentKind.RACK ? (input.totalU ?? 42) : null,
        height3d: input.height3d ?? null,
        installDate: input.installDate ? new Date(input.installDate) : null,
        manager: input.manager,
        description: input.description,
        properties: (input.properties ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        createdById: userId,
        updatedById: userId,
      },
    });

    return this.mapToDetail(equipment);
  }

  async update(id: string, input: UpdateEquipmentInput, userId: string): Promise<EquipmentDetail> {
    const existing = await prisma.equipment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('설비');

    // OFD uniqueness re-check when changing into OFD
    if (input.kind === EquipmentKind.OFD && existing.kind !== EquipmentKind.OFD) {
      await this.validateOfdUniqueness(existing.floorId, id);
    }

    // totalU 정규화: RACK kind 만 의미를 가짐.
    //   - RACK 인데 totalU 가 명시적 null/undefined 면 기존 값 유지(없으면 42)
    //   - kind 가 RACK 이 아니면 totalU 강제로 null
    let totalU: number | null | undefined = input.totalU;
    const effectiveKind = input.kind ?? existing.kind;
    if (effectiveKind === EquipmentKind.RACK) {
      if (input.kind === EquipmentKind.RACK && existing.kind !== EquipmentKind.RACK) {
        // 다른 kind → RACK 으로 전환: totalU 가 없으면 42 부여
        totalU = input.totalU ?? 42;
      }
    } else if (input.kind !== undefined) {
      // 명시적으로 RACK 이 아닌 kind 로 변경 → totalU null 강제
      totalU = null;
    }

    const equipment = await prisma.equipment.update({
      where: { id },
      data: {
        kind: input.kind,
        name: input.name,
        positionX: input.positionX,
        positionY: input.positionY,
        width2d: input.width2d,
        height2d: input.height2d,
        rotation: input.rotation,
        totalU,
        height3d: input.height3d,
        frontImageUrl: input.frontImageUrl,
        rearImageUrl: input.rearImageUrl,
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
    });

    return this.mapToDetail(equipment);
  }

  async delete(id: string): Promise<void> {
    const equipment = await prisma.equipment.findUnique({
      where: { id },
      include: {
        sourceCables: { select: { id: true } },
        targetCables: { select: { id: true } },
        modules: { select: { id: true } },
      },
    });

    if (!equipment) throw new NotFoundError('설비');

    const connectionCount = equipment.sourceCables.length + equipment.targetCables.length;
    if (connectionCount > 0) {
      throw new ConflictError(
        `연결된 케이블이 ${connectionCount}개 있어 삭제할 수 없습니다. 케이블을 먼저 제거하세요.`
      );
    }

    await prisma.equipment.delete({ where: { id } });
  }

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
