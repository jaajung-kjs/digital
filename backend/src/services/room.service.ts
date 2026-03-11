import prisma from '../config/prisma.js';
import { Prisma, EquipmentCategory } from '@prisma/client';
import { NotFoundError, ConflictError } from '../utils/errors.js';

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
  equipment: {
    id: string;
    name: string;
    category: string;
    positionX: number | null;
    positionY: number | null;
    width: number | null;
    height: number | null;
    rotation: number;
    frontImageUrl: string | null;
    rearImageUrl: string | null;
    description: string | null;
    model: string | null;
    manufacturer: string | null;
    manager: string | null;
    height3d: number | null;
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
  equipment?: {
    id?: string | null;
    name: string;
    category?: string;
    positionX: number;
    positionY: number;
    width: number;
    height: number;
    rotation?: number;
    description?: string | null;
    model?: string | null;
    manufacturer?: string | null;
    manager?: string | null;
    height3d?: number | null;
  }[];
  deletedElementIds?: string[];
  deletedEquipmentIds?: string[];
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
      },
    });

    if (!room) throw new NotFoundError('실');

    const equipment = await prisma.equipment.findMany({
      where: { roomId: id },
      select: {
        id: true,
        name: true,
        category: true,
        positionX: true,
        positionY: true,
        width2d: true,
        height2d: true,
        rotation: true,
        frontImageUrl: true,
        rearImageUrl: true,
        description: true,
        model: true,
        manufacturer: true,
        manager: true,
        height3d: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

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
      equipment: equipment.map((e) => ({
        id: e.id,
        name: e.name,
        category: e.category,
        positionX: e.positionX ?? 0,
        positionY: e.positionY ?? 0,
        width: e.width2d ?? 60,
        height: e.height2d ?? 100,
        rotation: e.rotation ?? 0,
        frontImageUrl: e.frontImageUrl,
        rearImageUrl: e.rearImageUrl,
        description: e.description,
        model: e.model,
        manufacturer: e.manufacturer,
        manager: e.manager,
        height3d: e.height3d,
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
  ): Promise<{ id: string; version: number; message: string; equipmentIdMap: Record<number, string> }> {
    const room = await prisma.room.findUnique({ where: { id } });
    if (!room) throw new NotFoundError('실');

    let newVersion = 0;
    const equipmentIdMap: Record<number, string> = {};

    await prisma.$transaction(async (tx) => {
      if (input.deletedElementIds && input.deletedElementIds.length > 0) {
        await tx.floorPlanElement.deleteMany({
          where: { id: { in: input.deletedElementIds }, roomId: id },
        });
      }

      if (input.deletedEquipmentIds && input.deletedEquipmentIds.length > 0) {
        await tx.equipment.deleteMany({
          where: { id: { in: input.deletedEquipmentIds }, roomId: id },
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

      if (input.equipment && input.equipment.length > 0) {
        for (let i = 0; i < input.equipment.length; i++) {
          const equip = input.equipment[i];
          if (equip.id) {
            await tx.equipment.update({
              where: { id: equip.id },
              data: {
                name: equip.name,
                category: equip.category as EquipmentCategory | undefined,
                positionX: equip.positionX,
                positionY: equip.positionY,
                width2d: equip.width,
                height2d: equip.height,
                rotation: equip.rotation ?? 0,
                description: equip.description,
                model: equip.model,
                manufacturer: equip.manufacturer,
                manager: equip.manager,
                height3d: equip.height3d,
                updatedById: userId,
              },
            });
          } else {
            const created = await tx.equipment.create({
              data: {
                roomId: id,
                name: equip.name,
                category: (equip.category as EquipmentCategory) ?? 'NETWORK',
                positionX: equip.positionX,
                positionY: equip.positionY,
                width2d: equip.width,
                height2d: equip.height,
                rotation: equip.rotation ?? 0,
                description: equip.description,
                model: equip.model,
                manufacturer: equip.manufacturer,
                manager: equip.manager,
                height3d: equip.height3d,
                createdById: userId,
                updatedById: userId,
              },
            });
            equipmentIdMap[i] = created.id;
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
      equipmentIdMap,
    };
  }
}

export const roomService = new RoomService();
