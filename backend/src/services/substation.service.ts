import prisma from '../config/prisma.js';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../utils/errors.js';

// ==================== Types ====================

export interface SubstationListItem {
  id: string;
  name: string;
  code: string;
  address: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  floorCount: number;
  createdAt: Date;
}

export interface SubstationDetail {
  id: string;
  name: string;
  code: string;
  address: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  floors: {
    id: string;
    name: string;
    floorNumber: string | null;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSubstationInput {
  name: string;
  code: string;
  address?: string;
  description?: string;
}

export interface UpdateSubstationInput {
  name?: string;
  code?: string;
  address?: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
}

// ==================== Service ====================

class SubstationService {
  /**
   * 변전소 목록 조회
   */
  async getList(isActive?: boolean): Promise<SubstationListItem[]> {
    const where = isActive !== undefined ? { isActive } : {};

    const substations = await prisma.substation.findMany({
      where,
      include: {
        _count: {
          select: { floors: true },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return substations.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      address: s.address,
      description: s.description,
      sortOrder: s.sortOrder,
      isActive: s.isActive,
      floorCount: s._count.floors,
      createdAt: s.createdAt,
    }));
  }

  /**
   * 변전소 상세 조회
   */
  async getById(id: string): Promise<SubstationDetail> {
    const substation = await prisma.substation.findUnique({
      where: { id },
      include: {
        floors: {
          select: {
            id: true,
            name: true,
            floorNumber: true,
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!substation) {
      throw new NotFoundError('변전소');
    }

    return {
      id: substation.id,
      name: substation.name,
      code: substation.code,
      address: substation.address,
      description: substation.description,
      sortOrder: substation.sortOrder,
      isActive: substation.isActive,
      floors: substation.floors,
      createdAt: substation.createdAt,
      updatedAt: substation.updatedAt,
    };
  }

  /**
   * 변전소 생성
   */
  async create(
    input: CreateSubstationInput,
    userId: string
  ): Promise<SubstationDetail> {
    // 코드 형식 검증
    this.validateCode(input.code);

    // 코드 중복 확인
    const existing = await prisma.substation.findUnique({
      where: { code: input.code },
    });

    if (existing) {
      throw new ConflictError('변전소 코드가 이미 존재합니다.');
    }

    const substation = await prisma.substation.create({
      data: {
        name: input.name,
        code: input.code,
        address: input.address,
        description: input.description,
        createdById: userId,
        updatedById: userId,
      },
      include: {
        floors: {
          select: {
            id: true,
            name: true,
            floorNumber: true,
          },
        },
      },
    });

    return {
      id: substation.id,
      name: substation.name,
      code: substation.code,
      address: substation.address,
      description: substation.description,
      sortOrder: substation.sortOrder,
      isActive: substation.isActive,
      floors: substation.floors,
      createdAt: substation.createdAt,
      updatedAt: substation.updatedAt,
    };
  }

  /**
   * 변전소 수정
   */
  async update(
    id: string,
    input: UpdateSubstationInput,
    userId: string
  ): Promise<SubstationDetail> {
    // 존재 여부 확인
    const existing = await prisma.substation.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('변전소');
    }

    // 코드 변경 시 검증
    if (input.code && input.code !== existing.code) {
      this.validateCode(input.code);

      const codeExists = await prisma.substation.findUnique({
        where: { code: input.code },
      });

      if (codeExists) {
        throw new ConflictError('변전소 코드가 이미 존재합니다.');
      }
    }

    const substation = await prisma.substation.update({
      where: { id },
      data: {
        ...input,
        updatedById: userId,
      },
      include: {
        floors: {
          select: {
            id: true,
            name: true,
            floorNumber: true,
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    return {
      id: substation.id,
      name: substation.name,
      code: substation.code,
      address: substation.address,
      description: substation.description,
      sortOrder: substation.sortOrder,
      isActive: substation.isActive,
      floors: substation.floors,
      createdAt: substation.createdAt,
      updatedAt: substation.updatedAt,
    };
  }

  /**
   * 변전소 삭제
   */
  async delete(id: string): Promise<void> {
    const substation = await prisma.substation.findUnique({
      where: { id },
      include: {
        _count: {
          select: { floors: true },
        },
      },
    });

    if (!substation) {
      throw new NotFoundError('변전소');
    }

    // 하위 층이 있는 경우 삭제 불가
    if (substation._count.floors > 0) {
      throw new ConflictError('하위 층이 존재하여 삭제할 수 없습니다.');
    }

    await prisma.substation.delete({
      where: { id },
    });
  }

  /**
   * 코드 형식 검증 (영문 대문자 + 숫자 + 하이픈)
   */
  private validateCode(code: string): void {
    const codePattern = /^[A-Z0-9-]+$/;
    if (!codePattern.test(code)) {
      throw new ValidationError(
        '변전소 코드는 영문 대문자, 숫자, 하이픈만 사용할 수 있습니다.'
      );
    }
  }
}

export const substationService = new SubstationService();
