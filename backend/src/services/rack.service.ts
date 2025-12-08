import prisma from '../config/prisma.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';

// ==================== Types ====================

export interface RackDetail {
  id: string;
  floorPlanId: string;
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

// ==================== Service ====================

class RackService {
  /**
   * 평면도의 모든 랙 조회
   */
  async getByFloorPlanId(floorPlanId: string): Promise<RackDetail[]> {
    const floorPlan = await prisma.floorPlan.findUnique({
      where: { id: floorPlanId },
    });

    if (!floorPlan) {
      throw new NotFoundError('평면도');
    }

    const racks = await prisma.rack.findMany({
      where: { floorPlanId },
      include: {
        equipment: {
          select: {
            heightU: true,
          },
        },
        _count: {
          select: { equipment: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    return racks.map((r) => ({
      id: r.id,
      floorPlanId: r.floorPlanId,
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
      sortOrder: r.sortOrder,
      equipmentCount: r._count.equipment,
      usedU: r.equipment.reduce((sum, e) => sum + e.heightU, 0),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  /**
   * 랙 상세 조회
   */
  async getById(id: string): Promise<RackDetail> {
    const rack = await prisma.rack.findUnique({
      where: { id },
      include: {
        equipment: {
          select: {
            heightU: true,
          },
        },
        _count: {
          select: { equipment: true },
        },
      },
    });

    if (!rack) {
      throw new NotFoundError('랙');
    }

    return {
      id: rack.id,
      floorPlanId: rack.floorPlanId,
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

  /**
   * 랙 생성
   */
  async create(
    floorPlanId: string,
    input: CreateRackInput,
    userId: string
  ): Promise<RackDetail> {
    const floorPlan = await prisma.floorPlan.findUnique({
      where: { id: floorPlanId },
    });

    if (!floorPlan) {
      throw new NotFoundError('평면도');
    }

    // 동일 평면도 내 이름 중복 확인
    const existing = await prisma.rack.findFirst({
      where: {
        floorPlanId,
        name: input.name,
      },
    });

    if (existing) {
      throw new ConflictError('동일한 이름의 랙이 이미 존재합니다.');
    }

    const rack = await prisma.rack.create({
      data: {
        floorPlanId,
        name: input.name,
        code: input.code,
        positionX: input.positionX,
        positionY: input.positionY,
        width: input.width ?? 60,
        height: input.height ?? 100,
        rotation: input.rotation ?? 0,
        totalU: input.totalU ?? 12,
        description: input.description,
        createdById: userId,
        updatedById: userId,
      },
    });

    return {
      id: rack.id,
      floorPlanId: rack.floorPlanId,
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

  /**
   * 랙 수정
   */
  async update(
    id: string,
    input: UpdateRackInput,
    userId: string
  ): Promise<RackDetail> {
    const existing = await prisma.rack.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('랙');
    }

    // 이름 변경 시 중복 확인
    if (input.name && input.name !== existing.name) {
      const nameExists = await prisma.rack.findFirst({
        where: {
          floorPlanId: existing.floorPlanId,
          name: input.name,
          id: { not: id },
        },
      });

      if (nameExists) {
        throw new ConflictError('동일한 이름의 랙이 이미 존재합니다.');
      }
    }

    const rack = await prisma.rack.update({
      where: { id },
      data: {
        ...input,
        updatedById: userId,
      },
      include: {
        equipment: {
          select: {
            heightU: true,
          },
        },
        _count: {
          select: { equipment: true },
        },
      },
    });

    return {
      id: rack.id,
      floorPlanId: rack.floorPlanId,
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

  /**
   * 랙 삭제
   */
  async delete(id: string): Promise<void> {
    const rack = await prisma.rack.findUnique({
      where: { id },
      include: {
        _count: {
          select: { equipment: true },
        },
      },
    });

    if (!rack) {
      throw new NotFoundError('랙');
    }

    // 설비가 있는 경우 삭제 불가
    if (rack._count.equipment > 0) {
      throw new ConflictError('설비가 존재하여 삭제할 수 없습니다. 먼저 설비를 삭제하세요.');
    }

    await prisma.rack.delete({
      where: { id },
    });
  }

  /**
   * 랙 이미지 삭제 (URL을 null로 설정)
   */
  async deleteImage(
    id: string,
    imageType: 'front' | 'rear',
    userId: string
  ): Promise<RackDetail> {
    const existing = await prisma.rack.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('랙');
    }

    const updateData = imageType === 'front'
      ? { frontImageUrl: null }
      : { rearImageUrl: null };

    const rack = await prisma.rack.update({
      where: { id },
      data: {
        ...updateData,
        updatedById: userId,
      },
      include: {
        equipment: {
          select: {
            heightU: true,
          },
        },
        _count: {
          select: { equipment: true },
        },
      },
    });

    return {
      id: rack.id,
      floorPlanId: rack.floorPlanId,
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

  /**
   * 랙 이미지 URL 업데이트
   */
  async updateImage(
    id: string,
    imageType: 'front' | 'rear',
    imageUrl: string,
    userId: string
  ): Promise<RackDetail> {
    const existing = await prisma.rack.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('랙');
    }

    const updateData = imageType === 'front'
      ? { frontImageUrl: imageUrl }
      : { rearImageUrl: imageUrl };

    const rack = await prisma.rack.update({
      where: { id },
      data: {
        ...updateData,
        updatedById: userId,
      },
      include: {
        equipment: {
          select: {
            heightU: true,
          },
        },
        _count: {
          select: { equipment: true },
        },
      },
    });

    return {
      id: rack.id,
      floorPlanId: rack.floorPlanId,
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
}

export const rackService = new RackService();
