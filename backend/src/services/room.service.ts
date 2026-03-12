import prisma from '../config/prisma.js';
import { Prisma, EquipmentCategory, CableType } from '@prisma/client';
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
    tempId?: string;
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
  cables?: {
    id?: string | null;
    sourceEquipmentId: string;
    targetEquipmentId: string;
    cableType: string;
    label?: string | null;
    length?: number | null;
    color?: string | null;
  }[];
  deletedElementIds?: string[];
  deletedEquipmentIds?: string[];
  deletedCableIds?: string[];
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
  ): Promise<{ id: string; version: number; message: string; equipmentIdMap: Record<string, string> }> {
    const room = await prisma.room.findUnique({ where: { id } });
    if (!room) throw new NotFoundError('실');

    let newVersion = 0;
    const equipmentIdMap: Record<string, string> = {};

    await prisma.$transaction(async (tx) => {
      if (input.deletedElementIds && input.deletedElementIds.length > 0) {
        await tx.floorPlanElement.deleteMany({
          where: { id: { in: input.deletedElementIds }, roomId: id },
        });
      }

      if (input.deletedCableIds && input.deletedCableIds.length > 0) {
        await tx.cable.deleteMany({
          where: { id: { in: input.deletedCableIds } },
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
        for (const equip of input.equipment) {
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
            if (equip.tempId) {
              equipmentIdMap[equip.tempId] = created.id;
            }
          }
        }
      }

      // Cable create/update (after equipment so tempIds are resolved)
      if (input.cables && input.cables.length > 0) {
        for (const cable of input.cables) {
          const srcId = equipmentIdMap[cable.sourceEquipmentId] ?? cable.sourceEquipmentId;
          const tgtId = equipmentIdMap[cable.targetEquipmentId] ?? cable.targetEquipmentId;

          if (cable.id) {
            await tx.cable.update({
              where: { id: cable.id },
              data: {
                sourceEquipmentId: srcId,
                targetEquipmentId: tgtId,
                cableType: cable.cableType as CableType,
                label: cable.label,
                length: cable.length,
                color: cable.color,
                updatedById: userId,
              },
            });
          } else {
            await tx.cable.create({
              data: {
                sourceEquipmentId: srcId,
                targetEquipmentId: tgtId,
                cableType: cable.cableType as CableType,
                label: cable.label,
                length: cable.length,
                color: cable.color,
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

      // Capture snapshot inside transaction (all changes visible via tx)
      const snapshotElements = await tx.floorPlanElement.findMany({
        where: { roomId: id },
        orderBy: { zIndex: 'asc' },
      });
      const snapshotEquipment = await tx.equipment.findMany({
        where: { roomId: id },
        select: {
          id: true, name: true, category: true,
          positionX: true, positionY: true, width2d: true, height2d: true,
          rotation: true, frontImageUrl: true, rearImageUrl: true,
          description: true, model: true, manufacturer: true, manager: true, height3d: true,
        },
        orderBy: { sortOrder: 'asc' },
      });
      const snapshotCables = await tx.cable.findMany({
        where: {
          OR: [
            { sourceEquipment: { roomId: id } },
            { targetEquipment: { roomId: id } },
          ],
        },
        include: {
          sourceEquipment: { select: { id: true, name: true, rackId: true, roomId: true } },
          targetEquipment: { select: { id: true, name: true, rackId: true, roomId: true } },
        },
      });

      const snapshot = {
        plan: {
          id: updated.id, name: updated.name,
          canvasWidth: updated.canvasWidth, canvasHeight: updated.canvasHeight,
          gridSize: updated.gridSize, majorGridSize: updated.majorGridSize,
          backgroundColor: updated.backgroundColor,
          elements: snapshotElements.map((e) => ({
            id: e.id, elementType: e.elementType,
            properties: e.properties as Record<string, unknown>,
            zIndex: e.zIndex, isVisible: e.isVisible,
          })),
          equipment: snapshotEquipment.map((e) => ({
            id: e.id, name: e.name, category: e.category,
            positionX: e.positionX ?? 0, positionY: e.positionY ?? 0,
            width: e.width2d ?? 60, height: e.height2d ?? 100,
            rotation: e.rotation ?? 0,
            frontImageUrl: e.frontImageUrl, rearImageUrl: e.rearImageUrl,
            description: e.description, model: e.model,
            manufacturer: e.manufacturer, manager: e.manager, height3d: e.height3d,
          })),
          version: newVersion, updatedAt: updated.updatedAt,
        },
        cables: snapshotCables.map((c) => ({
          id: c.id,
          sourceEquipmentId: c.sourceEquipmentId, targetEquipmentId: c.targetEquipmentId,
          cableType: c.cableType, label: c.label, length: c.length, color: c.color,
          pathPoints: c.pathPoints, description: c.description,
          sourceEquipment: c.sourceEquipment, targetEquipment: c.targetEquipment,
        })),
      };

      // Record audit log with complete snapshot
      const user = await tx.user.findUnique({ where: { id: userId }, select: { name: true } });
      const changedFields: string[] = [];
      if (input.elements) changedFields.push('elements');
      if (input.equipment) changedFields.push('equipment');
      if (input.cables?.length || input.deletedCableIds?.length) changedFields.push('cables');
      if (input.deletedElementIds?.length) changedFields.push('deletedElements');
      if (input.deletedEquipmentIds?.length) changedFields.push('deletedEquipment');
      if (input.canvasWidth || input.canvasHeight) changedFields.push('canvas');
      if (input.gridSize || input.majorGridSize) changedFields.push('grid');

      await tx.auditLog.create({
        data: {
          entityType: 'Room', entityId: id, entityName: room.name,
          action: 'UPDATE', actionDetail: `v${newVersion} 저장`,
          changedFields, newValues: snapshot as any,
          userId, userName: user?.name ?? null,
        },
      });
    });

    return {
      id: id,
      version: newVersion,
      message: '저장되었습니다.',
      equipmentIdMap,
    };
  }

  /**
   * 도면 변경 이력 조회
   */
  async getAuditLogs(roomId: string) {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundError('실');

    return prisma.auditLog.findMany({
      where: { entityType: 'Room', entityId: roomId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * 특정 변경 이력의 스냅샷 데이터 반환 (DB 수정 없음)
   */
  async getAuditLogSnapshot(roomId: string, auditLogId: string) {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundError('실');

    const log = await prisma.auditLog.findUnique({ where: { id: auditLogId } });
    if (!log) throw new NotFoundError('변경 이력');
    if (log.entityType !== 'Room' || log.entityId !== roomId) {
      throw new NotFoundError('변경 이력');
    }

    const snapshot = log.newValues as any;
    if (!snapshot) {
      throw new ConflictError('이 버전에는 되돌리기 데이터가 없습니다.');
    }

    // New format: { plan: RoomPlanDetail, cables: [...] }
    if (snapshot.plan) {
      return {
        plan: snapshot.plan,
        cables: snapshot.cables ?? [],
      };
    }

    // Legacy format: { elements, equipment, cables, canvasWidth, ... }
    if (snapshot.elements && snapshot.equipment) {
      return {
        plan: {
          id: roomId,
          name: room?.name ?? '',
          canvasWidth: snapshot.canvasWidth,
          canvasHeight: snapshot.canvasHeight,
          gridSize: snapshot.gridSize,
          majorGridSize: snapshot.majorGridSize,
          backgroundColor: snapshot.backgroundColor,
          elements: snapshot.elements,
          equipment: snapshot.equipment,
          version: 0,
          updatedAt: log.createdAt,
        },
        cables: snapshot.cables ?? [],
      };
    }

    throw new ConflictError('이 버전에는 되돌리기 데이터가 없습니다.');
  }

  /**
   * 도면 변경 이력 삭제
   */
  async deleteAuditLog(logId: string) {
    const log = await prisma.auditLog.findUnique({ where: { id: logId } });
    if (!log) throw new NotFoundError('변경 이력');
    await prisma.auditLog.delete({ where: { id: logId } });
  }
}

export const roomService = new RoomService();
