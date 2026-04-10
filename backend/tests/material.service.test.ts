import { describe, it, expect, vi, beforeEach } from 'vitest';
import { materialService } from '../src/services/material.service.js';
import prisma from '../src/config/prisma.js';

vi.mock('../src/config/prisma.js', () => ({
  default: {
    materialCategory: { findUnique: vi.fn() },
    material: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
  },
}));

describe('MaterialService', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const mockCategory = {
    id: 'cat-1',
    code: 'CBL-UTP',
    name: 'UTP/S-FTP케이블',
    unit: 'm',
    specTemplate: {
      params: [
        { key: 'shield', label: '차폐', inputType: 'select', options: ['UTP', 'S-FTP'] },
        { key: 'cat', label: '카테고리', inputType: 'select', options: ['5E', '6', '6A'] },
        { key: 'pairs', label: '페어수(P)', inputType: 'select', options: [4, 25] },
      ],
      format: '{shield} CAT.{cat} {pairs}P',
    },
  };

  describe('resolve', () => {
    it('should return existing material if specification matches', async () => {
      vi.mocked(prisma.materialCategory.findUnique).mockResolvedValue(mockCategory as any);
      const existing = { id: 'mat-1', specification: 'UTP CAT.6 4P' };
      vi.mocked(prisma.material.findFirst).mockResolvedValue(existing as any);

      const result = await materialService.resolve('cat-1', { shield: 'UTP', cat: '6', pairs: 4 });
      expect(result).toEqual({ ...existing, created: false });
      expect(prisma.material.create).not.toHaveBeenCalled();
    });

    it('should create new material if specification not found', async () => {
      vi.mocked(prisma.materialCategory.findUnique).mockResolvedValue(mockCategory as any);
      vi.mocked(prisma.material.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.material.count).mockResolvedValue(5);
      const created = { id: 'mat-new', specification: 'UTP CAT.6A 4P', code: 'CBL-UTP-006' };
      vi.mocked(prisma.material.create).mockResolvedValue(created as any);

      const result = await materialService.resolve('cat-1', { shield: 'UTP', cat: '6A', pairs: 4 });
      expect(result).toEqual({ ...created, created: true });
      expect(prisma.material.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          categoryId: 'cat-1',
          specification: 'UTP CAT.6A 4P',
          name: 'UTP CAT.6A 4P',
          unit: 'm',
        }),
      });
    });

    it('should generate correct code based on count', async () => {
      vi.mocked(prisma.materialCategory.findUnique).mockResolvedValue(mockCategory as any);
      vi.mocked(prisma.material.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.material.count).mockResolvedValue(0);
      vi.mocked(prisma.material.create).mockResolvedValue({ id: 'new' } as any);

      await materialService.resolve('cat-1', { shield: 'UTP', cat: '5E', pairs: 4 });
      expect(prisma.material.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          code: 'CBL-UTP-001',
        }),
      });
    });

    it('should throw NotFoundError if category not found', async () => {
      vi.mocked(prisma.materialCategory.findUnique).mockResolvedValue(null);
      await expect(materialService.resolve('nope', {})).rejects.toThrow('찾을 수 없습니다');
    });

    it('should throw ValidationError if category has no specTemplate', async () => {
      vi.mocked(prisma.materialCategory.findUnique).mockResolvedValue(
        { ...mockCategory, specTemplate: null } as any
      );
      await expect(materialService.resolve('cat-1', {})).rejects.toThrow('specTemplate');
    });
  });

  describe('getByCategoryId', () => {
    it('should return materials for a category', async () => {
      const mats = [{ id: '1' }, { id: '2' }];
      vi.mocked(prisma.material.findMany).mockResolvedValue(mats as any);
      const result = await materialService.getByCategoryId('cat-1');
      expect(result).toEqual(mats);
      expect(prisma.material.findMany).toHaveBeenCalledWith({
        where: { categoryId: 'cat-1', isActive: true },
        orderBy: { specification: 'asc' },
      });
    });
  });
});
