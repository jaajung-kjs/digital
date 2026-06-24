import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assetCategoryService } from '../src/services/assetCategory.service.js';
import prisma from '../src/config/prisma.js';

vi.mock('../src/config/prisma.js', () => ({
  default: {
    assetCategory: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), findUnique: vi.fn() },
    assetType: { count: vi.fn() },
  },
}));

describe('AssetCategoryService', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('create 는 이름을 trim 해서 만든다', async () => {
    vi.mocked(prisma.assetCategory.create).mockImplementation(async (a: any) => ({ id: 'c1', sortOrder: 0, isActive: true, ...a.data }) as any);
    const res = await assetCategoryService.create({ name: '  광전송장치 ' });
    expect(res.name).toBe('광전송장치');
  });

  it('delete 는 사용 중이면 차단한다', async () => {
    vi.mocked(prisma.assetCategory.findUnique).mockResolvedValue({ id: 'c1', name: '광' } as any);
    vi.mocked(prisma.assetType.count).mockResolvedValue(2);
    await expect(assetCategoryService.delete('c1')).rejects.toThrow('사용 중인 종류');
  });

  it('delete 는 미사용이면 삭제한다', async () => {
    vi.mocked(prisma.assetCategory.findUnique).mockResolvedValue({ id: 'c1', name: '광' } as any);
    vi.mocked(prisma.assetType.count).mockResolvedValue(0);
    await assetCategoryService.delete('c1');
    expect(prisma.assetCategory.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });
});
