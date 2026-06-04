import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assetTypeService } from '../src/services/assetType.service.js';
import prisma from '../src/config/prisma.js';

vi.mock('../src/config/prisma.js', () => ({
  default: {
    assetType: { findMany: vi.fn(), findUnique: vi.fn() },
  },
}));

describe('AssetTypeService', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('getAll 은 isActive 종류를 sortOrder 순으로 반환', async () => {
    const rows = [{ id: '1', code: 'RACK', name: '랙', isActive: true, sortOrder: 10 }];
    vi.mocked(prisma.assetType.findMany).mockResolvedValue(rows as any);
    const result = await assetTypeService.getAll();
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe('RACK');
    expect(prisma.assetType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
  });

  it('getById 는 없으면 NotFoundError', async () => {
    vi.mocked(prisma.assetType.findUnique).mockResolvedValue(null);
    await expect(assetTypeService.getById('nope')).rejects.toThrow('찾을 수 없습니다');
  });
});
