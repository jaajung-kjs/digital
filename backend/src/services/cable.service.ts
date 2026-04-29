import prisma from '../config/prisma.js';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors.js';
import { CableType } from '@prisma/client';

/** Build specification string from specTemplate format + specParams */
function buildCableSpecification(specTemplate: unknown, specParams: unknown): string | null {
  if (!specTemplate || !specParams || typeof specTemplate !== 'object') return null;
  const tmpl = specTemplate as { format?: string };
  const params = specParams as Record<string, unknown>;
  if (!tmpl.format) return null;
  let result = tmpl.format;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(`{${key}}`, String(value ?? ''));
  }
  return result;
}

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
  materialCategoryId: string | null;
  materialCategoryCode: string | null;
  materialCategoryName: string | null;
  displayColor: string | null;
  specification: string | null;
  specParams: unknown;
  pathLength: number | null;
  bufferLength: number;
  totalLength: number | null;
  sourceEquipment: {
    id: string;
    name: string;
    parentEquipmentId: string | null;
    floorId: string | null;
  };
  targetEquipment: {
    id: string;
    name: string;
    parentEquipmentId: string | null;
    floorId: string | null;
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
      parentEquipmentId: true,
      floorId: true,
    },
  },
  targetEquipment: {
    select: {
      id: true,
      name: true,
      parentEquipmentId: true,
      floorId: true,
    },
  },
  fiberPath: {
    select: {
      id: true,
      ofdAId: true,
      ofdBId: true,
      ofdA: { select: { floor: { select: { substation: { select: { name: true } } } } } },
      ofdB: { select: { floor: { select: { substation: { select: { name: true } } } } } },
    },
  },
  materialCategory: {
    select: {
      code: true,
      name: true,
      displayColor: true,
      specTemplate: true,
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
  async getByFloorId(floorId: string): Promise<CableDetail[]> {
    const floor = await prisma.floor.findUnique({ where: { id: floorId } });
    if (!floor) throw new NotFoundError('층');

    const cables = await prisma.cable.findMany({
      where: {
        OR: [
          { sourceEquipment: { floorId } },
          { targetEquipment: { floorId } },
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
      materialCategoryId: c.materialCategoryId ?? null,
      materialCategoryCode: c.materialCategory?.code ?? null,
      materialCategoryName: c.materialCategory?.name ?? null,
      displayColor: c.materialCategory?.displayColor ?? null,
      specification: buildCableSpecification(c.materialCategory?.specTemplate, c.specParams),
      specParams: c.specParams ?? null,
      pathLength: c.pathLength ?? null,
      bufferLength: c.bufferLength ?? 4,
      totalLength: c.totalLength ?? null,
      sourceEquipment: {
        id: c.sourceEquipment.id,
        name: c.sourceEquipment.name,
        parentEquipmentId: c.sourceEquipment.parentEquipmentId,
        floorId: c.sourceEquipment.floorId,
      },
      targetEquipment: {
        id: c.targetEquipment.id,
        name: c.targetEquipment.name,
        parentEquipmentId: c.targetEquipment.parentEquipmentId,
        floorId: c.targetEquipment.floorId,
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

    const nameA = fp.ofdA?.floor?.substation?.name;
    const nameB = fp.ofdB?.floor?.substation?.name;
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
