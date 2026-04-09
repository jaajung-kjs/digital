import prisma from '../config/prisma.js';
import { NotFoundError } from '../utils/errors.js';

// ==================== Types ====================

export interface SubstationListItem {
  id: string;
  name: string;
  address: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  floorCount: number;
  createdAt: Date;
}

export interface SubstationDetail {
  id: string;
  name: string;
  address: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  floors: {
    id: string;
    name: string;
    floorNumber: string | null;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSubstationInput {
  name: string;
  branchId?: string;
  address?: string;
  description?: string;
}

export interface UpdateSubstationInput {
  name?: string;
  address?: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
}

// ==================== Service ====================

class SubstationService {
  /**
   * 변전소 목록 조회
   */
  async getList(isActive?: boolean): Promise<SubstationListItem[]> {
    const where = isActive !== undefined ? { isActive } : {};

    const substations = await prisma.substation.findMany({
      where,
      include: {
        _count: {
          select: { floors: true },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return substations.map((s) => ({
      id: s.id,
      name: s.name,
      address: s.address,
      description: s.description,
      sortOrder: s.sortOrder,
      isActive: s.isActive,
      floorCount: s._count.floors,
      createdAt: s.createdAt,
    }));
  }

  /**
   * 변전소 상세 조회
   */
  async getById(id: string): Promise<SubstationDetail> {
    const substation = await prisma.substation.findUnique({
      where: { id },
      include: {
        floors: {
          select: {
            id: true,
            name: true,
            floorNumber: true,
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!substation) {
      throw new NotFoundError('변전소');
    }

    return {
      id: substation.id,
      name: substation.name,
      address: substation.address,
      description: substation.description,
      sortOrder: substation.sortOrder,
      isActive: substation.isActive,
      floors: substation.floors,
      createdAt: substation.createdAt,
      updatedAt: substation.updatedAt,
    };
  }

  /**
   * 변전소 생성
   */
  async create(
    input: CreateSubstationInput,
    userId: string
  ): Promise<SubstationDetail> {
    const substation = await prisma.substation.create({
      data: {
        name: input.name,
        branchId: input.branchId,
        address: input.address,
        description: input.description,
        createdById: userId,
        updatedById: userId,
      },
      include: {
        floors: {
          select: {
            id: true,
            name: true,
            floorNumber: true,
          },
        },
      },
    });

    return {
      id: substation.id,
      name: substation.name,
      address: substation.address,
      description: substation.description,
      sortOrder: substation.sortOrder,
      isActive: substation.isActive,
      floors: substation.floors,
      createdAt: substation.createdAt,
      updatedAt: substation.updatedAt,
    };
  }

  /**
   * 변전소 수정
   */
  async update(
    id: string,
    input: UpdateSubstationInput,
    userId: string
  ): Promise<SubstationDetail> {
    const existing = await prisma.substation.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('변전소');
    }

    const substation = await prisma.substation.update({
      where: { id },
      data: {
        ...input,
        updatedById: userId,
      },
      include: {
        floors: {
          select: {
            id: true,
            name: true,
            floorNumber: true,
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    return {
      id: substation.id,
      name: substation.name,
      address: substation.address,
      description: substation.description,
      sortOrder: substation.sortOrder,
      isActive: substation.isActive,
      floors: substation.floors,
      createdAt: substation.createdAt,
      updatedAt: substation.updatedAt,
    };
  }

  /**
   * 변전소 삭제
   */
  async delete(id: string): Promise<void> {
    const substation = await prisma.substation.findUnique({
      where: { id },
    });

    if (!substation) {
      throw new NotFoundError('변전소');
    }

    await prisma.substation.delete({
      where: { id },
    });
  }
}

export const substationService = new SubstationService();
