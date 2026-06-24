import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cableGroupService } from '../src/services/cableGroup.service.js';
import prisma from '../src/config/prisma.js';

vi.mock('../src/config/prisma.js', () => ({
  default: {
    cableGroup: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    cableCategory: { count: vi.fn() },
  },
}));

describe('CableGroupService', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('create 는 이름 trim + 색 저장', async () => {
    vi.mocked(prisma.cableGroup.create).mockImplementation(async (a: any) => ({ id: 'g1', sortOrder: 0, isActive: true, ...a.data }) as any);
    const res = await cableGroupService.create({ name: ' 전원케이블 ', color: '#ef4444' });
    expect(res.name).toBe('전원케이블');
    expect(res.color).toBe('#ef4444');
  });

  it('delete 는 사용 중이면 차단', async () => {
    vi.mocked(prisma.cableGroup.findUnique).mockResolvedValue({ id: 'g1', name: '전원' } as any);
    vi.mocked(prisma.cableCategory.count).mockResolvedValue(3);
    await expect(cableGroupService.delete('g1')).rejects.toThrow('사용 중인 종류');
  });

  it('delete 는 미사용이면 삭제', async () => {
    vi.mocked(prisma.cableGroup.findUnique).mockResolvedValue({ id: 'g1', name: '전원' } as any);
    vi.mocked(prisma.cableCategory.count).mockResolvedValue(0);
    await cableGroupService.delete('g1');
    expect(prisma.cableGroup.delete).toHaveBeenCalledWith({ where: { id: 'g1' } });
  });
});
