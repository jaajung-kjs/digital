import { describe, it, expect, vi, beforeEach } from 'vitest';
import { materialCategoryService } from '../src/services/materialCategory.service.js';
import prisma from '../src/config/prisma.js';

vi.mock('../src/config/prisma.js', () => ({
  default: {
    materialCategory: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

describe('MaterialCategoryService', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('getAll', () => {
    it('should return all active categories', async () => {
      const mock = [{ id: '1', code: 'CBL-UTP', name: 'UTP', isActive: true }];
      vi.mocked(prisma.materialCategory.findMany).mockResolvedValue(mock as any);
      const result = await materialCategoryService.getAll();
      expect(result).toEqual(mock);
      expect(prisma.materialCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } })
      );
    });

    it('should filter by categoryType', async () => {
      vi.mocked(prisma.materialCategory.findMany).mockResolvedValue([]);
      await materialCategoryService.getAll({ type: 'CABLE' });
      expect(prisma.materialCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true, categoryType: 'CABLE' } })
      );
    });

    it('should filter by parentId', async () => {
      vi.mocked(prisma.materialCategory.findMany).mockResolvedValue([]);
      await materialCategoryService.getAll({ parentId: 'parent-1' });
      expect(prisma.materialCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true, parentId: 'parent-1' } })
      );
    });

    it('should filter top-level when parentId is null', async () => {
      vi.mocked(prisma.materialCategory.findMany).mockResolvedValue([]);
      await materialCategoryService.getAll({ parentId: null });
      expect(prisma.materialCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true, parentId: null } })
      );
    });
  });

  describe('getById', () => {
    it('should return category with children and aliases', async () => {
      const mock = { id: '1', code: 'ACC-PIPE', children: [], aliases: [] };
      vi.mocked(prisma.materialCategory.findUnique).mockResolvedValue(mock as any);
      const result = await materialCategoryService.getById('1');
      expect(result).toEqual(mock);
    });

    it('should throw NotFoundError if not exists', async () => {
      vi.mocked(prisma.materialCategory.findUnique).mockResolvedValue(null);
      await expect(materialCategoryService.getById('nope')).rejects.toThrow('찾을 수 없습니다');
    });
  });

  describe('getByType', () => {
    it('should return categories with hierarchy for ACCESSORY type', async () => {
      vi.mocked(prisma.materialCategory.findMany).mockResolvedValue([]);
      await materialCategoryService.getByType('ACCESSORY');
      expect(prisma.materialCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true, categoryType: 'ACCESSORY', parentId: null },
          include: expect.objectContaining({ children: expect.anything() }),
        })
      );
    });

    it('should return cable categories for CABLE type', async () => {
      const mock = [{ id: '1', code: 'CBL-UTP', children: [] }];
      vi.mocked(prisma.materialCategory.findMany).mockResolvedValue(mock as any);
      const result = await materialCategoryService.getByType('CABLE');
      expect(result).toEqual(mock);
      expect(prisma.materialCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true, categoryType: 'CABLE', parentId: null },
        })
      );
    });
  });
});
