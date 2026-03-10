import prisma from '../config/prisma.js';
import { Prisma } from '@prisma/client';
import { NotFoundError, ConflictError } from '../utils/errors.js';

// ==================== Types ====================

export interface RackDetail {
  id: string;
  roomId: string;
  name: string;
  code: string | null;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  rotation: number;
  totalU: number;
  frontImageUrl: string | null;
  rearImageUrl: string | null;
  description: string | null;
  sortOrder: number;
  equipmentCount: number;
  usedU: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRackInput {
  name: string;
  code?: string;
  positionX: number;
  positionY: number;
  width?: number;
  height?: number;
  rotation?: number;
  totalU?: number;
  description?: string;
}

export interface UpdateRackInput {
  name?: string;
  code?: string;
  positionX?: number;
  positionY?: number;
  width?: number;
  height?: number;
  rotation?: number;
  totalU?: number;
  description?: string;
  sortOrder?: number;
}

export const RACK_DEFAULTS = { width: 60, height: 100, rotation: 0, totalU: 12 } as const;

// ==================== Shared Constants ====================

const RACK_DETAIL_INCLUDE = {
  equipment: { select: { heightU: true } },
  _count: { select: { equipment: true } },
};

type RackWithEquipment = Prisma.RackGetPayload<{ include: typeof RACK_DETAIL_INCLUDE }>;

function toRackDetail(rack: RackWithEquipment): RackDetail {
  return {
    id: rack.id,
    roomId: rack.roomId,
    name: rack.name,
    code: rack.code,
    positionX: rack.positionX,
    positionY: rack.positionY,
    width: rack.width,
    height: rack.height,
    rotation: rack.rotation,
    totalU: rack.totalU,
    frontImageUrl: rack.frontImageUrl,
    rearImageUrl: rack.rearImageUrl,
    description: rack.description,
    sortOrder: rack.sortOrder,
    equipmentCount: rack._count.equipment,
    usedU: rack.equipment.reduce((sum, e) => sum + e.heightU, 0),
    createdAt: rack.createdAt,
    updatedAt: rack.updatedAt,
  };
}

// ==================== Service ====================

class RackService {
  async getByRoomId(roomId: string): Promise<RackDetail[]> {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundError('실');

    const racks = await prisma.rack.findMany({
      where: { roomId },
      include: RACK_DETAIL_INCLUDE,
      orderBy: { sortOrder: 'asc' },
    });

    return racks.map(toRackDetail);
  }

  async getById(id: string): Promise<RackDetail> {
    const rack = await prisma.rack.findUnique({
      where: { id },
      include: RACK_DETAIL_INCLUDE,
    });
    if (!rack) throw new NotFoundError('랙');

    return toRackDetail(rack);
  }

  async create(roomId: string, input: CreateRackInput, userId: string): Promise<RackDetail> {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundError('실');

    const existing = await prisma.rack.findFirst({
      where: { roomId, name: input.name },
    });
    if (existing) throw new ConflictError('동일한 이름의 랙이 이미 존재합니다.');

    const rack = await prisma.rack.create({
      data: {
        roomId,
        name: input.name,
        code: input.code,
        positionX: input.positionX,
        positionY: input.positionY,
        width: input.width ?? RACK_DEFAULTS.width,
        height: input.height ?? RACK_DEFAULTS.height,
        rotation: input.rotation ?? RACK_DEFAULTS.rotation,
        totalU: input.totalU ?? RACK_DEFAULTS.totalU,
        description: input.description,
        createdById: userId,
        updatedById: userId,
      },
    });

    return {
      id: rack.id,
      roomId: rack.roomId,
      name: rack.name,
      code: rack.code,
      positionX: rack.positionX,
      positionY: rack.positionY,
      width: rack.width,
      height: rack.height,
      rotation: rack.rotation,
      totalU: rack.totalU,
      frontImageUrl: rack.frontImageUrl,
      rearImageUrl: rack.rearImageUrl,
      description: rack.description,
      sortOrder: rack.sortOrder,
      equipmentCount: 0,
      usedU: 0,
      createdAt: rack.createdAt,
      updatedAt: rack.updatedAt,
    };
  }

  async update(id: string, input: UpdateRackInput, userId: string): Promise<RackDetail> {
    const existing = await prisma.rack.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('랙');

    if (input.name && input.name !== existing.name) {
      const nameExists = await prisma.rack.findFirst({
        where: { roomId: existing.roomId, name: input.name, id: { not: id } },
      });
      if (nameExists) throw new ConflictError('동일한 이름의 랙이 이미 존재합니다.');
    }

    const rack = await prisma.rack.update({
      where: { id },
      data: { ...input, updatedById: userId },
      include: RACK_DETAIL_INCLUDE,
    });

    return toRackDetail(rack);
  }

  async delete(id: string): Promise<void> {
    const rack = await prisma.rack.findUnique({
      where: { id },
      include: { _count: { select: { equipment: true } } },
    });
    if (!rack) throw new NotFoundError('랙');

    if (rack._count.equipment > 0) {
      throw new ConflictError('설비가 존재하여 삭제할 수 없습니다. 먼저 설비를 삭제하세요.');
    }

    await prisma.rack.delete({ where: { id } });
  }

  async deleteImage(id: string, imageType: 'front' | 'rear', userId: string): Promise<RackDetail> {
    const existing = await prisma.rack.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('랙');

    const rack = await prisma.rack.update({
      where: { id },
      data: {
        ...(imageType === 'front' ? { frontImageUrl: null } : { rearImageUrl: null }),
        updatedById: userId,
      },
      include: RACK_DETAIL_INCLUDE,
    });

    return toRackDetail(rack);
  }

  async updateImage(id: string, imageType: 'front' | 'rear', imageUrl: string, userId: string): Promise<RackDetail> {
    const existing = await prisma.rack.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('랙');

    const rack = await prisma.rack.update({
      where: { id },
      data: {
        ...(imageType === 'front' ? { frontImageUrl: imageUrl } : { rearImageUrl: imageUrl }),
        updatedById: userId,
      },
      include: RACK_DETAIL_INCLUDE,
    });

    return toRackDetail(rack);
  }
}

export const rackService = new RackService();
