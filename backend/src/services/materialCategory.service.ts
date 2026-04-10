import prisma from '../config/prisma.js';
import { NotFoundError } from '../utils/errors.js';
import type { MaterialCategoryType } from '@prisma/client';

interface GetAllFilters {
  type?: MaterialCategoryType;
  parentId?: string | null;
}

class MaterialCategoryService {
  async getAll(filters?: GetAllFilters) {
    const where: any = { isActive: true };
    if (filters?.type) where.categoryType = filters.type;
    if (filters && 'parentId' in filters) where.parentId = filters.parentId;

    return prisma.materialCategory.findMany({
      where,
      include: { children: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getById(id: string) {
    const category = await prisma.materialCategory.findUnique({
      where: { id },
      include: {
        children: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        aliases: { orderBy: { aliasName: 'asc' } },
      },
    });
    if (!category) throw new NotFoundError('자재 카테고리');
    return category;
  }

  async getByType(type: MaterialCategoryType) {
    return prisma.materialCategory.findMany({
      where: { isActive: true, categoryType: type, parentId: null },
      include: {
        children: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }
}

export const materialCategoryService = new MaterialCategoryService();
