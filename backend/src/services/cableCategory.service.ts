import prisma from '../config/prisma.js';
import { NotFoundError } from '../utils/errors.js';

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
}

export const cableCategoryService = new CableCategoryService();
