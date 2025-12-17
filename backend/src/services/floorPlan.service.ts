import prisma from '../config/prisma.js';
import { Prisma } from '@prisma/client';
import { NotFoundError, ConflictError } from '../utils/errors.js';

// ==================== Types ====================

export interface FloorPlanElement {
  id: string;
  elementType: string;
  properties: Record<string, unknown>;
  zIndex: number;
  isVisible: boolean;
}

export interface RackItem {
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
}

export interface FloorPlanDetail {
  id: string;
  floorId: string;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  gridSize: number;
  majorGridSize: number;
  backgroundColor: string;
  elements: FloorPlanElement[];
  racks: RackItem[];
  version: number;
  updatedAt: Date;
}

export interface CreateFloorPlanInput {
  name: string;
  canvasWidth?: number;
  canvasHeight?: number;
  gridSize?: number;
  majorGridSize?: number;
}

export interface UpdateFloorPlanInput {
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

// ==================== Service ====================

class FloorPlanService {
  /**
   * 층의 평면도 조회
   */
  async getByFloorId(floorId: string): Promise<FloorPlanDetail | null> {
    // 층 존재 확인
    const floor = await prisma.floor.findUnique({
      where: { id: floorId },
    });

    if (!floor) {
      throw new NotFoundError('층');
    }

    const floorPlan = await prisma.floorPlan.findUnique({
      where: { floorId },
      include: {
        elements: {
          where: { isVisible: true },
          orderBy: { zIndex: 'asc' },
        },
        racks: {
          include: {
            _count: {
              select: { equipment: true },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!floorPlan) {
      return null;
    }

    return {
      id: floorPlan.id,
      floorId: floorPlan.floorId,
      name: floorPlan.name,
      canvasWidth: floorPlan.canvasWidth,
      canvasHeight: floorPlan.canvasHeight,
      gridSize: floorPlan.gridSize,
      majorGridSize: floorPlan.majorGridSize,
      backgroundColor: floorPlan.backgroundColor,
      elements: floorPlan.elements.map((e) => ({
        id: e.id,
        elementType: e.elementType,
        properties: e.properties as Record<string, unknown>,
        zIndex: e.zIndex,
        isVisible: e.isVisible,
      })),
      racks: floorPlan.racks.map((r) => ({
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
      version: floorPlan.version,
      updatedAt: floorPlan.updatedAt,
    };
  }

  /**
   * 평면도 생성
   */
  async create(
    floorId: string,
    input: CreateFloorPlanInput,
    userId: string
  ): Promise<FloorPlanDetail> {
    // 층 존재 확인
    const floor = await prisma.floor.findUnique({
      where: { id: floorId },
    });

    if (!floor) {
      throw new NotFoundError('층');
    }

    // 이미 평면도가 있는지 확인
    const existing = await prisma.floorPlan.findUnique({
      where: { floorId },
    });

    if (existing) {
      throw new ConflictError('이미 평면도가 존재합니다.');
    }

    const floorPlan = await prisma.floorPlan.create({
      data: {
        floorId,
        name: input.name,
        canvasWidth: input.canvasWidth ?? 2000,
        canvasHeight: input.canvasHeight ?? 1500,
        gridSize: input.gridSize ?? 10,
        majorGridSize: input.majorGridSize ?? 60,
        createdById: userId,
        updatedById: userId,
      },
    });

    return {
      id: floorPlan.id,
      floorId: floorPlan.floorId,
      name: floorPlan.name,
      canvasWidth: floorPlan.canvasWidth,
      canvasHeight: floorPlan.canvasHeight,
      gridSize: floorPlan.gridSize,
      majorGridSize: floorPlan.majorGridSize,
      backgroundColor: floorPlan.backgroundColor,
      elements: [],
      racks: [],
      version: floorPlan.version,
      updatedAt: floorPlan.updatedAt,
    };
  }

  /**
   * 평면도 전체 저장 (벌크 업데이트)
   */
  async bulkUpdate(
    id: string,
    input: UpdateFloorPlanInput,
    userId: string
  ): Promise<{ id: string; version: number; message: string }> {
    const floorPlan = await prisma.floorPlan.findUnique({
      where: { id },
    });

    if (!floorPlan) {
      throw new NotFoundError('평면도');
    }

    // 트랜잭션으로 처리
    await prisma.$transaction(async (tx) => {
      // 1. 삭제할 요소 삭제
      if (input.deletedElementIds && input.deletedElementIds.length > 0) {
        await tx.floorPlanElement.deleteMany({
          where: {
            id: { in: input.deletedElementIds },
            floorPlanId: id,
          },
        });
      }

      // 2. 삭제할 랙 삭제
      if (input.deletedRackIds && input.deletedRackIds.length > 0) {
        await tx.rack.deleteMany({
          where: {
            id: { in: input.deletedRackIds },
            floorPlanId: id,
          },
        });
      }

      // 3. 요소 upsert
      if (input.elements && input.elements.length > 0) {
        for (const element of input.elements) {
          if (element.id) {
            // 기존 요소 업데이트
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
            // 새 요소 생성
            await tx.floorPlanElement.create({
              data: {
                floorPlanId: id,
                elementType: element.elementType,
                properties: element.properties as Prisma.InputJsonValue,
                zIndex: element.zIndex ?? 0,
                isVisible: element.isVisible ?? true,
              },
            });
          }
        }
      }

      // 4. 랙 upsert
      if (input.racks && input.racks.length > 0) {
        for (const rack of input.racks) {
          if (rack.id) {
            // 기존 랙 업데이트
            await tx.rack.update({
              where: { id: rack.id },
              data: {
                name: rack.name,
                code: rack.code,
                positionX: rack.positionX,
                positionY: rack.positionY,
                width: rack.width ?? 60,
                height: rack.height ?? 100,
                rotation: rack.rotation ?? 0,
                totalU: rack.totalU ?? 12,
                description: rack.description,
                updatedById: userId,
              },
            });
          } else {
            // 새 랙 생성 - 이름 중복 체크
            const existingRack = await tx.rack.findFirst({
              where: {
                floorPlanId: id,
                name: rack.name,
              },
            });

            if (existingRack) {
              throw new ConflictError(`랙 이름 '${rack.name}'이(가) 이미 존재합니다.`);
            }

            await tx.rack.create({
              data: {
                floorPlanId: id,
                name: rack.name,
                code: rack.code,
                positionX: rack.positionX,
                positionY: rack.positionY,
                width: rack.width ?? 60,
                height: rack.height ?? 100,
                rotation: rack.rotation ?? 0,
                totalU: rack.totalU ?? 12,
                description: rack.description,
                createdById: userId,
                updatedById: userId,
              },
            });
          }
        }
      }

      // 5. 평면도 정보 업데이트
      await tx.floorPlan.update({
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
    });

    const updated = await prisma.floorPlan.findUnique({
      where: { id },
    });

    return {
      id: id,
      version: updated!.version,
      message: '저장되었습니다.',
    };
  }

  /**
   * 평면도 삭제
   */
  async delete(id: string): Promise<void> {
    const floorPlan = await prisma.floorPlan.findUnique({
      where: { id },
    });

    if (!floorPlan) {
      throw new NotFoundError('평면도');
    }

    // Cascade로 요소, 랙도 함께 삭제됨
    await prisma.floorPlan.delete({
      where: { id },
    });
  }
}

export const floorPlanService = new FloorPlanService();
