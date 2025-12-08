import prisma from '../config/prisma.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';

// ==================== Types ====================

export interface FloorListItem {
  id: string;
  name: string;
  floorNumber: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  hasFloorPlan: boolean;
  rackCount: number;
}

export interface FloorDetail {
  id: string;
  substationId: string;
  name: string;
  floorNumber: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  hasFloorPlan: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFloorInput {
  name: string;
  floorNumber?: string;
  description?: string;
}

export interface UpdateFloorInput {
  name?: string;
  floorNumber?: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
}

// ==================== Service ====================

class FloorService {
  /**
   * 변전소의 층 목록 조회
   */
  async getListBySubstation(substationId: string): Promise<FloorListItem[]> {
    // 변전소 존재 확인
    const substation = await prisma.substation.findUnique({
      where: { id: substationId },
    });

    if (!substation) {
      throw new NotFoundError('변전소');
    }

    const floors = await prisma.floor.findMany({
      where: { substationId },
      include: {
        floorPlan: {
          include: {
            _count: {
              select: { racks: true },
            },
          },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return floors.map((f) => ({
      id: f.id,
      name: f.name,
      floorNumber: f.floorNumber,
      description: f.description,
      sortOrder: f.sortOrder,
      isActive: f.isActive,
      hasFloorPlan: !!f.floorPlan,
      rackCount: f.floorPlan?._count.racks ?? 0,
    }));
  }

  /**
   * 층 상세 조회
   */
  async getById(id: string): Promise<FloorDetail> {
    const floor = await prisma.floor.findUnique({
      where: { id },
      include: {
        floorPlan: true,
      },
    });

    if (!floor) {
      throw new NotFoundError('층');
    }

    return {
      id: floor.id,
      substationId: floor.substationId,
      name: floor.name,
      floorNumber: floor.floorNumber,
      description: floor.description,
      sortOrder: floor.sortOrder,
      isActive: floor.isActive,
      hasFloorPlan: !!floor.floorPlan,
      createdAt: floor.createdAt,
      updatedAt: floor.updatedAt,
    };
  }

  /**
   * 층 생성
   */
  async create(
    substationId: string,
    input: CreateFloorInput,
    userId: string
  ): Promise<FloorDetail> {
    // 변전소 존재 확인
    const substation = await prisma.substation.findUnique({
      where: { id: substationId },
    });

    if (!substation) {
      throw new NotFoundError('변전소');
    }

    // 동일 변전소 내 이름 중복 확인
    const existing = await prisma.floor.findFirst({
      where: {
        substationId,
        name: input.name,
      },
    });

    if (existing) {
      throw new ConflictError('동일한 이름의 층이 이미 존재합니다.');
    }

    const floor = await prisma.floor.create({
      data: {
        substationId,
        name: input.name,
        floorNumber: input.floorNumber,
        description: input.description,
        createdById: userId,
        updatedById: userId,
      },
      include: {
        floorPlan: true,
      },
    });

    return {
      id: floor.id,
      substationId: floor.substationId,
      name: floor.name,
      floorNumber: floor.floorNumber,
      description: floor.description,
      sortOrder: floor.sortOrder,
      isActive: floor.isActive,
      hasFloorPlan: !!floor.floorPlan,
      createdAt: floor.createdAt,
      updatedAt: floor.updatedAt,
    };
  }

  /**
   * 층 수정
   */
  async update(
    id: string,
    input: UpdateFloorInput,
    userId: string
  ): Promise<FloorDetail> {
    const existing = await prisma.floor.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('층');
    }

    // 이름 변경 시 중복 확인
    if (input.name && input.name !== existing.name) {
      const nameExists = await prisma.floor.findFirst({
        where: {
          substationId: existing.substationId,
          name: input.name,
          id: { not: id },
        },
      });

      if (nameExists) {
        throw new ConflictError('동일한 이름의 층이 이미 존재합니다.');
      }
    }

    const floor = await prisma.floor.update({
      where: { id },
      data: {
        ...input,
        updatedById: userId,
      },
      include: {
        floorPlan: true,
      },
    });

    return {
      id: floor.id,
      substationId: floor.substationId,
      name: floor.name,
      floorNumber: floor.floorNumber,
      description: floor.description,
      sortOrder: floor.sortOrder,
      isActive: floor.isActive,
      hasFloorPlan: !!floor.floorPlan,
      createdAt: floor.createdAt,
      updatedAt: floor.updatedAt,
    };
  }

  /**
   * 층 삭제
   */
  async delete(id: string): Promise<void> {
    const floor = await prisma.floor.findUnique({
      where: { id },
      include: {
        floorPlan: true,
      },
    });

    if (!floor) {
      throw new NotFoundError('층');
    }

    // 평면도가 있는 경우 삭제 불가 (또는 함께 삭제)
    if (floor.floorPlan) {
      throw new ConflictError('평면도가 존재하여 삭제할 수 없습니다. 먼저 평면도를 삭제하세요.');
    }

    await prisma.floor.delete({
      where: { id },
    });
  }
}

export const floorService = new FloorService();
