import prisma from '../config/prisma.js';
import { NotFoundError } from '../utils/errors.js';

// ==================== Types ====================

export interface RackModuleCategoryDetail {
  id: string;
  code: string;
  name: string;
  description: string | null;
  displayColor: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ==================== Service ====================

class RackModuleCategoryService {
  private mapToDetail(c: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    displayColor: string | null;
    sortOrder: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): RackModuleCategoryDetail {
    return {
      id: c.id,
      code: c.code,
      name: c.name,
      description: c.description,
      displayColor: c.displayColor,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

  async getAll(): Promise<RackModuleCategoryDetail[]> {
    const categories = await prisma.rackModuleCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    return categories.map((c) => this.mapToDetail(c));
  }

  async getById(id: string): Promise<RackModuleCategoryDetail> {
    const category = await prisma.rackModuleCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundError('랙 모듈 카테고리');
    return this.mapToDetail(category);
  }
}

export const rackModuleCategoryService = new RackModuleCategoryService();
