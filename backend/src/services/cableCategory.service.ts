import { randomUUID } from 'node:crypto';
import prisma from '../config/prisma.js';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors.js';

export const CABLE_GROUPS = ['광', '전원', '네트워크', '제어', '접지'] as const;
export type CableGroup = (typeof CABLE_GROUPS)[number];

export interface CreateCableCategoryInput { name: string; displayGroup: string; sortOrder?: number }
export interface UpdateCableCategoryInput { name?: string; displayGroup?: string; sortOrder?: number; isActive?: boolean }

// ==================== Types ====================

export interface CableCategoryDetail {
  id: string;
  code: string;
  name: string;
  description: string | null;
  displayColor: string | null;
  displayGroup: string | null;
  iconName: string | null;
  unit: string | null;
  specTemplate: unknown;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ==================== Service ====================

class CableCategoryService {
  private mapToDetail(c: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    displayColor: string | null;
    displayGroup: string | null;
    iconName: string | null;
    unit: string | null;
    specTemplate: unknown;
    sortOrder: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): CableCategoryDetail {
    return {
      id: c.id,
      code: c.code,
      name: c.name,
      description: c.description,
      displayColor: c.displayColor,
      displayGroup: c.displayGroup,
      iconName: c.iconName,
      unit: c.unit,
      specTemplate: c.specTemplate,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

  async getAll(): Promise<CableCategoryDetail[]> {
    const categories = await prisma.cableCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    return categories.map((c) => this.mapToDetail(c));
  }

  async getById(id: string): Promise<CableCategoryDetail> {
    const category = await prisma.cableCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundError('케이블 카테고리');
    return this.mapToDetail(category);
  }

  async create(input: CreateCableCategoryInput): Promise<CableCategoryDetail> {
    if (!CABLE_GROUPS.includes(input.displayGroup as CableGroup)) {
      throw new ValidationError(`허용되지 않은 분류입니다: ${input.displayGroup}`);
    }
    const code = `CBL-${randomUUID().slice(0, 8).toUpperCase()}`;
    const row = await prisma.cableCategory.create({
      data: { code, name: input.name.trim(), displayGroup: input.displayGroup, sortOrder: input.sortOrder ?? 0 },
    });
    return this.mapToDetail(row);
  }

  async update(id: string, input: UpdateCableCategoryInput): Promise<CableCategoryDetail> {
    const existing = await prisma.cableCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('케이블 카테고리');
    if (input.displayGroup !== undefined && !CABLE_GROUPS.includes(input.displayGroup as CableGroup)) {
      throw new ValidationError(`허용되지 않은 분류입니다: ${input.displayGroup}`);
    }
    const row = await prisma.cableCategory.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.displayGroup !== undefined ? { displayGroup: input.displayGroup } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
    return this.mapToDetail(row);
  }

  async delete(id: string): Promise<void> {
    const existing = await prisma.cableCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('케이블 카테고리');
    const inUse = await prisma.cable.count({ where: { categoryId: id } });
    if (inUse > 0) {
      throw new ConflictError(`이 분류를 사용 중인 케이블 ${inUse}개가 있어 삭제할 수 없습니다.`);
    }
    await prisma.cableCategory.delete({ where: { id } });
  }
}

export const cableCategoryService = new CableCategoryService();
