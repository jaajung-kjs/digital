import prisma from '../config/prisma.js';
import { Prisma } from '@prisma/client';
import { NotFoundError } from '../utils/errors.js';

// ==================== Types ====================

export interface FloorPlanElementDetail {
  id: string;
  floorPlanId: string;
  elementType: string;
  properties: Record<string, unknown>;
  zIndex: number;
  isVisible: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateElementInput {
  elementType: string;
  properties: Record<string, unknown>;
  zIndex?: number;
  isVisible?: boolean;
}

export interface UpdateElementInput {
  elementType?: string;
  properties?: Record<string, unknown>;
  zIndex?: number;
  isVisible?: boolean;
}

// ==================== Service ====================

class FloorPlanElementService {
  /**
   * 평면도의 모든 요소 조회
   */
  async getByFloorPlanId(floorPlanId: string): Promise<FloorPlanElementDetail[]> {
    const floorPlan = await prisma.floorPlan.findUnique({
      where: { id: floorPlanId },
    });

    if (!floorPlan) {
      throw new NotFoundError('평면도');
    }

    const elements = await prisma.floorPlanElement.findMany({
      where: { floorPlanId },
      orderBy: { zIndex: 'asc' },
    });

    return elements.map((e) => ({
      id: e.id,
      floorPlanId: e.floorPlanId,
      elementType: e.elementType,
      properties: e.properties as Record<string, unknown>,
      zIndex: e.zIndex,
      isVisible: e.isVisible,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }));
  }

  /**
   * 요소 생성
   */
  async create(
    floorPlanId: string,
    input: CreateElementInput
  ): Promise<FloorPlanElementDetail> {
    const floorPlan = await prisma.floorPlan.findUnique({
      where: { id: floorPlanId },
    });

    if (!floorPlan) {
      throw new NotFoundError('평면도');
    }

    const element = await prisma.floorPlanElement.create({
      data: {
        floorPlanId,
        elementType: input.elementType,
        properties: input.properties as Prisma.InputJsonValue,
        zIndex: input.zIndex ?? 0,
        isVisible: input.isVisible ?? true,
      },
    });

    return {
      id: element.id,
      floorPlanId: element.floorPlanId,
      elementType: element.elementType,
      properties: element.properties as Record<string, unknown>,
      zIndex: element.zIndex,
      isVisible: element.isVisible,
      createdAt: element.createdAt,
      updatedAt: element.updatedAt,
    };
  }

  /**
   * 요소 수정
   */
  async update(
    id: string,
    input: UpdateElementInput
  ): Promise<FloorPlanElementDetail> {
    const existing = await prisma.floorPlanElement.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('평면도 요소');
    }

    const element = await prisma.floorPlanElement.update({
      where: { id },
      data: {
        elementType: input.elementType,
        properties: input.properties as Prisma.InputJsonValue | undefined,
        zIndex: input.zIndex,
        isVisible: input.isVisible,
      },
    });

    return {
      id: element.id,
      floorPlanId: element.floorPlanId,
      elementType: element.elementType,
      properties: element.properties as Record<string, unknown>,
      zIndex: element.zIndex,
      isVisible: element.isVisible,
      createdAt: element.createdAt,
      updatedAt: element.updatedAt,
    };
  }

  /**
   * 요소 삭제
   */
  async delete(id: string): Promise<void> {
    const existing = await prisma.floorPlanElement.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('평면도 요소');
    }

    await prisma.floorPlanElement.delete({
      where: { id },
    });
  }
}

export const floorPlanElementService = new FloorPlanElementService();
