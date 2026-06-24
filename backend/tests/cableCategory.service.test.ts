import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cableCategoryService } from '../src/services/cableCategory.service.js';
import prisma from '../src/config/prisma.js';

vi.mock('../src/config/prisma.js', () => ({
  default: {
    cableCategory: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    cable: { count: vi.fn() },
  },
}));

describe('CableCategoryService 쓰기', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('create 는 code 를 자동 생성하고 displayGroup 을 싣는다', async () => {
    vi.mocked(prisma.cableCategory.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.cableCategory.create).mockImplementation(async (a: any) => ({
      id: 'x', description: null, displayColor: null, iconName: null, unit: null,
      specTemplate: null, sortOrder: 0, isActive: true, createdAt: new Date(), updatedAt: new Date(),
      ...a.data,
    }) as any);
    const res = await cableCategoryService.create({ name: 'F-CV 4SQ', displayGroup: '전원' });
    const data = vi.mocked(prisma.cableCategory.create).mock.calls[0][0].data as any;
    expect(data.code).toMatch(/^CBL-/);
    expect(res.displayGroup).toBe('전원');
  });

  it('create 는 잘못된 displayGroup 을 거부한다', async () => {
    await expect(
      cableCategoryService.create({ name: 'x', displayGroup: '아무거나' }),
    ).rejects.toThrow('분류');
  });

  it('delete 는 사용 중이면 차단한다', async () => {
    vi.mocked(prisma.cableCategory.findUnique).mockResolvedValue({ id: 'x' } as any);
    vi.mocked(prisma.cable.count).mockResolvedValue(5);
    await expect(cableCategoryService.delete('x')).rejects.toThrow('사용 중인 케이블');
  });
});
