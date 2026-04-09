import prisma from '../config/prisma.js';

export const materialCategoryService = {
  async findAll() {
    return prisma.materialCategory.findMany({
      where: { isActive: true },
      include: {
        aliases: true,
        children: {
          where: { isActive: true },
          include: { aliases: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
  },

  async findById(id: string) {
    return prisma.materialCategory.findUnique({
      where: { id },
      include: {
        aliases: true,
        children: { where: { isActive: true } },
        parent: true,
      },
    });
  },

  async findByType(type: 'CABLE' | 'EQUIPMENT' | 'ACCESSORY') {
    return prisma.materialCategory.findMany({
      where: { categoryType: type, isActive: true, parentId: null },
      include: {
        aliases: true,
        children: {
          where: { isActive: true },
          include: { aliases: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
  },
};
