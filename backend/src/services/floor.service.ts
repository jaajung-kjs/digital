import prisma from '../config/prisma.js';
import { Prisma } from '@prisma/client';
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

// ==================== Shared ====================

const FLOOR_COUNT_INCLUDE = {
  _count: { select: { rooms: true } },
};

type FloorWithCount = Prisma.FloorGetPayload<{ include: typeof FLOOR_COUNT_INCLUDE }>;

function toFloorDetail(f: FloorWithCount): FloorDetail {
  return {
    id: f.id,
    substationId: f.substationId,
    name: f.name,
    floorNumber: f.floorNumber,
    description: f.description,
    sortOrder: f.sortOrder,
    isActive: f.isActive,
    roomCount: f._count.rooms,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}

function toFloorListItem(f: FloorWithCount): FloorListItem {
  return {
    id: f.id,
    name: f.name,
    floorNumber: f.floorNumber,
    description: f.description,
    sortOrder: f.sortOrder,
    isActive: f.isActive,
    roomCount: f._count.rooms,
  };
}

// ==================== Service ====================

class FloorService {
  async getListBySubstation(substationId: string): Promise<FloorListItem[]> {
    const substation = await prisma.substation.findUnique({ where: { id: substationId } });
    if (!substation) throw new NotFoundError('변전소');

    const floors = await prisma.floor.findMany({
      where: { substationId },
      include: FLOOR_COUNT_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return floors.map(toFloorListItem);
  }

  async getById(id: string): Promise<FloorDetail> {
    const floor = await prisma.floor.findUnique({
      where: { id },
      include: FLOOR_COUNT_INCLUDE,
    });
    if (!floor) throw new NotFoundError('층');

    return toFloorDetail(floor);
  }

  async create(substationId: string, input: CreateFloorInput, userId: string): Promise<FloorDetail> {
    const substation = await prisma.substation.findUnique({ where: { id: substationId } });
    if (!substation) throw new NotFoundError('변전소');

    const existing = await prisma.floor.findFirst({
      where: { substationId, name: input.name },
    });
    if (existing) throw new ConflictError('동일한 이름의 층이 이미 존재합니다.');

    const floor = await prisma.floor.create({
      data: {
        substationId,
        name: input.name,
        floorNumber: input.floorNumber,
        description: input.description,
        createdById: userId,
        updatedById: userId,
      },
      include: FLOOR_COUNT_INCLUDE,
    });

    return toFloorDetail(floor);
  }

  async update(id: string, input: UpdateFloorInput, userId: string): Promise<FloorDetail> {
    const existing = await prisma.floor.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('층');

    if (input.name && input.name !== existing.name) {
      const nameExists = await prisma.floor.findFirst({
        where: { substationId: existing.substationId, name: input.name, id: { not: id } },
      });
      if (nameExists) throw new ConflictError('동일한 이름의 층이 이미 존재합니다.');
    }

    const floor = await prisma.floor.update({
      where: { id },
      data: { ...input, updatedById: userId },
      include: FLOOR_COUNT_INCLUDE,
    });

    return toFloorDetail(floor);
  }

  async delete(id: string): Promise<void> {
    const floor = await prisma.floor.findUnique({ where: { id } });
    if (!floor) throw new NotFoundError('층');
    await prisma.floor.delete({ where: { id } });
  }
}

export const floorService = new FloorService();
