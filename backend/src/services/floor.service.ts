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
  roomCount: number;
}

export interface FloorDetail {
  id: string;
  substationId: string;
  name: string;
  floorNumber: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  roomCount: number;
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
    const substation = await prisma.substation.findUnique({
      where: { id: substationId },
    });

    if (!substation) {
      throw new NotFoundError('변전소');
    }

    const floors = await prisma.floor.findMany({
      where: { substationId },
      include: {
        _count: {
          select: { rooms: true },
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
      roomCount: f._count.rooms,
    }));
  }

  /**
   * 층 상세 조회
   */
  async getById(id: string): Promise<FloorDetail> {
    const floor = await prisma.floor.findUnique({
      where: { id },
      include: {
        _count: {
          select: { rooms: true },
        },
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
      roomCount: floor._count.rooms,
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
    const substation = await prisma.substation.findUnique({
      where: { id: substationId },
    });

    if (!substation) {
      throw new NotFoundError('변전소');
    }

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
        _count: {
          select: { rooms: true },
        },
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
      roomCount: floor._count.rooms,
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
        _count: {
          select: { rooms: true },
        },
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
      roomCount: floor._count.rooms,
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
    });

    if (!floor) {
      throw new NotFoundError('층');
    }

    await prisma.floor.delete({
      where: { id },
    });
  }
}

export const floorService = new FloorService();
