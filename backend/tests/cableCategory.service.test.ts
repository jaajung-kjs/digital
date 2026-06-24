import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cableCategoryService } from '../src/services/cableCategory.service.js';
import prisma from '../src/config/prisma.js';

vi.mock('../src/config/prisma.js', () => ({
  default: {
    cableCategory: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    cableGroup: { findUnique: vi.fn() },
    cable: { count: vi.fn() },
  },
}));

describe('CableCategoryService 쓰기', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('create 는 groupId 를 싣고 group.name 을 displayGroup 에 동기화', async () => {
    vi.mocked(prisma.cableGroup.findUnique).mockResolvedValue({ id: 'g1', name: '전원', color: '#ef4444' } as any);
    vi.mocked(prisma.cableCategory.create).mockImplementation(async (a: any) => ({
      id: 'x', description: null, displayColor: null, iconName: null, unit: null,
      specTemplate: null, sortOrder: 0, isActive: true, createdAt: new Date(), updatedAt: new Date(),
      group: { id: 'g1', name: '전원', color: '#ef4444' }, ...a.data,
    }) as any);
    const res = await cableCategoryService.create({ name: 'Fr-sq3.5', groupId: 'g1' });
    const data = vi.mocked(prisma.cableCategory.create).mock.calls[0][0].data as any;
    expect(data.code).toMatch(/^CBL-/);
    expect(data.groupId).toBe('g1');
    expect(data.displayGroup).toBe('전원');
    expect(res.groupId).toBe('g1');
  });

  it('create 는 없는 groupId 를 거부한다', async () => {
    vi.mocked(prisma.cableGroup.findUnique).mockResolvedValue(null);
    await expect(
      cableCategoryService.create({ name: 'x', groupId: 'nope' }),
    ).rejects.toThrow('그룹');
  });

  it('delete 는 사용 중이면 차단한다', async () => {
    vi.mocked(prisma.cableCategory.findUnique).mockResolvedValue({ id: 'x' } as any);
    vi.mocked(prisma.cable.count).mockResolvedValue(5);
    await expect(cableCategoryService.delete('x')).rejects.toThrow('사용 중인 케이블');
  });
});
