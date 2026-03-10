import prisma from '../config/prisma.js';
import { Prisma } from '@prisma/client';
import { NotFoundError, ConflictError } from '../utils/errors.js';
import { RACK_DEFAULTS } from './rack.service.js';

// ==================== Types ====================

export interface RoomListItem {
  id: string;
  floorId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface RoomDetail {
  id: string;
  floorId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoomPlanDetail {
  id: string;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  gridSize: number;
  majorGridSize: number;
  backgroundColor: string;
  elements: {
    id: string;
    elementType: string;
    properties: Record<string, unknown>;
    zIndex: number;
    isVisible: boolean;
  }[];
  racks: {
    id: string;
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
    equipmentCount?: number;
  }[];
  version: number;
  updatedAt: Date;
}

export interface CreateRoomInput {
  name: string;
}

export interface UpdateRoomInput {
  name?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdatePlanInput {
  canvasWidth?: number;
  canvasHeight?: number;
  gridSize?: number;
  majorGridSize?: number;
  backgroundColor?: string;
  elements?: {
    id?: string | null;
    elementType: string;
    properties: Record<string, unknown>;
    zIndex?: number;
    isVisible?: boolean;
  }[];
  racks?: {
    id?: string | null;
    name: string;
    code?: string;
    positionX: number;
    positionY: number;
    width?: number;
    height?: number;
    rotation?: number;
    totalU?: number;
    description?: string;
  }[];
  deletedElementIds?: string[];
  deletedRackIds?: string[];
}

// ==================== Shared ====================

type RoomRecord = Prisma.RoomGetPayload<{}>;

function toRoomDetail(r: RoomRecord): RoomDetail {
  return {
    id: r.id,
    floorId: r.floorId,
    name: r.name,
    sortOrder: r.sortOrder,
    isActive: r.isActive,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// ==================== Service ====================

class RoomService {
  async getListByFloor(floorId: string): Promise<RoomListItem[]> {
    const floor = await prisma.floor.findUnique({ where: { id: floorId } });
    if (!floor) throw new NotFoundError('층');

    const rooms = await prisma.room.findMany({
      where: { floorId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return rooms.map((r) => ({
      id: r.id,
      floorId: r.floorId,
      name: r.name,
      sortOrder: r.sortOrder,
      isActive: r.isActive,
    }));
  }

  async getById(id: string): Promise<RoomDetail> {
    const room = await prisma.room.findUnique({ where: { id } });
    if (!room) throw new NotFoundError('실');
    return toRoomDetail(room);
  }

  async getPlan(id: string): Promise<RoomPlanDetail> {
    const room = await prisma.room.findUnique({
      where: { id },
      include: {
        elements: {
          where: { isVisible: true },
          orderBy: { zIndex: 'asc' },
        },
        racks: {
          include: {
            _count: { select: { equipment: true } },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!room) throw new NotFoundError('실');

    return {
      id: room.id,
      name: room.name,
      canvasWidth: room.canvasWidth,
      canvasHeight: room.canvasHeight,
      gridSize: room.gridSize,
      majorGridSize: room.majorGridSize,
      backgroundColor: room.backgroundColor,
      elements: room.elements.map((e) => ({
        id: e.id,
        elementType: e.elementType,
        properties: e.properties as Record<string, unknown>,
        zIndex: e.zIndex,
        isVisible: e.isVisible,
      })),
      racks: room.racks.map((r) => ({
        id: r.id,
        name: r.name,
        code: r.code,
        positionX: r.positionX,
        positionY: r.positionY,
        width: r.width,
        height: r.height,
        rotation: r.rotation,
        totalU: r.totalU,
        frontImageUrl: r.frontImageUrl,
        rearImageUrl: r.rearImageUrl,
        description: r.description,
        equipmentCount: r._count.equipment,
      })),
      version: room.version,
      updatedAt: room.updatedAt,
    };
  }

  async create(floorId: string, input: CreateRoomInput, userId: string): Promise<RoomDetail> {
    const floor = await prisma.floor.findUnique({ where: { id: floorId } });
    if (!floor) throw new NotFoundError('층');

    const existing = await prisma.room.findFirst({
      where: { floorId, name: input.name },
    });
    if (existing) throw new ConflictError('동일한 이름의 실이 이미 존재합니다.');

    const room = await prisma.room.create({
      data: {
        floorId,
        name: input.name,
        createdById: userId,
        updatedById: userId,
      },
    });

    return toRoomDetail(room);
  }

  async update(id: string, input: UpdateRoomInput, userId: string): Promise<RoomDetail> {
    const existing = await prisma.room.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('실');

    if (input.name && input.name !== existing.name) {
      const nameExists = await prisma.room.findFirst({
        where: { floorId: existing.floorId, name: input.name, id: { not: id } },
      });
      if (nameExists) throw new ConflictError('동일한 이름의 실이 이미 존재합니다.');
    }

    const room = await prisma.room.update({
      where: { id },
      data: { ...input, updatedById: userId },
    });

    return toRoomDetail(room);
  }

  async delete(id: string): Promise<void> {
    const existing = await prisma.room.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('실');
    await prisma.room.delete({ where: { id } });
  }

  /**
   * 도면 전체 저장 (벌크 업데이트)
   */
  async bulkUpdatePlan(
    id: string,
    input: UpdatePlanInput,
    userId: string
  ): Promise<{ id: string; version: number; message: string }> {
    const room = await prisma.room.findUnique({ where: { id } });
    if (!room) throw new NotFoundError('실');

    let newVersion = 0;

    await prisma.$transaction(async (tx) => {
      if (input.deletedElementIds && input.deletedElementIds.length > 0) {
        await tx.floorPlanElement.deleteMany({
          where: { id: { in: input.deletedElementIds }, roomId: id },
        });
      }

      if (input.deletedRackIds && input.deletedRackIds.length > 0) {
        await tx.rack.deleteMany({
          where: { id: { in: input.deletedRackIds }, roomId: id },
        });
      }

      if (input.elements && input.elements.length > 0) {
        for (const element of input.elements) {
          if (element.id) {
            await tx.floorPlanElement.update({
              where: { id: element.id },
              data: {
                elementType: element.elementType,
                properties: element.properties as Prisma.InputJsonValue,
                zIndex: element.zIndex ?? 0,
                isVisible: element.isVisible ?? true,
              },
            });
          } else {
            await tx.floorPlanElement.create({
              data: {
                roomId: id,
                elementType: element.elementType,
                properties: element.properties as Prisma.InputJsonValue,
                zIndex: element.zIndex ?? 0,
                isVisible: element.isVisible ?? true,
              },
            });
          }
        }
      }

      if (input.racks && input.racks.length > 0) {
        for (const rack of input.racks) {
          if (rack.id) {
            await tx.rack.update({
              where: { id: rack.id },
              data: {
                name: rack.name,
                code: rack.code,
                positionX: rack.positionX,
                positionY: rack.positionY,
                width: rack.width ?? RACK_DEFAULTS.width,
                height: rack.height ?? RACK_DEFAULTS.height,
                rotation: rack.rotation ?? RACK_DEFAULTS.rotation,
                totalU: rack.totalU ?? RACK_DEFAULTS.totalU,
                description: rack.description,
                updatedById: userId,
              },
            });
          } else {
            const existingRack = await tx.rack.findFirst({
              where: { roomId: id, name: rack.name },
            });
            if (existingRack) {
              throw new ConflictError(`랙 이름 '${rack.name}'이(가) 이미 존재합니다.`);
            }
            await tx.rack.create({
              data: {
                roomId: id,
                name: rack.name,
                code: rack.code,
                positionX: rack.positionX,
                positionY: rack.positionY,
                width: rack.width ?? RACK_DEFAULTS.width,
                height: rack.height ?? RACK_DEFAULTS.height,
                rotation: rack.rotation ?? RACK_DEFAULTS.rotation,
                totalU: rack.totalU ?? RACK_DEFAULTS.totalU,
                description: rack.description,
                createdById: userId,
                updatedById: userId,
              },
            });
          }
        }
      }

      const updated = await tx.room.update({
        where: { id },
        data: {
          canvasWidth: input.canvasWidth,
          canvasHeight: input.canvasHeight,
          gridSize: input.gridSize,
          majorGridSize: input.majorGridSize,
          backgroundColor: input.backgroundColor,
          version: { increment: 1 },
          updatedById: userId,
        },
      });
      newVersion = updated.version;
    });

    return {
      id: id,
      version: newVersion,
      message: '저장되었습니다.',
    };
  }
}

export const roomService = new RoomService();
