import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assetTypeService } from '../src/services/assetType.service.js';
import prisma from '../src/config/prisma.js';

vi.mock('../src/config/prisma.js', () => ({
  default: {
    assetType: {
      findMany: vi.fn(), findUnique: vi.fn(),
      create: vi.fn(), update: vi.fn(), delete: vi.fn(), aggregate: vi.fn(),
    },
    asset: { count: vi.fn() },
  },
}));

const row = (over: Record<string, unknown> = {}) => ({
  id: 'id1', code: 'RACK', name: '랙', group: '구조', role: 'rack', categoryId: 'c1',
  isContainer: true, fieldTemplate: null, requiredToCreate: null, iconName: null,
  displayColor: null, placementKind: 'RACK', connectionKind: null, sortOrder: 10, isActive: true,
  ...over,
});

describe('AssetTypeService', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('getAll DTO 에 role/categoryId 를 포함한다', async () => {
    vi.mocked(prisma.assetType.findMany).mockResolvedValue([row()] as any);
    const result = await assetTypeService.getAll();
    expect(result[0].role).toBe('rack');
    expect(result[0].categoryId).toBe('c1');
  });

  it('getAll DTO 가 노무규칙 4필드를 값 그대로 노출한다', async () => {
    vi.mocked(prisma.assetType.findMany).mockResolvedValue([
      row({
        laborType: '통신설비공',
        installHoursPerUnit: 0.5, removeHoursPerUnit: 0.25, relocateHoursPerUnit: null,
      }),
    ] as any);
    const result = await assetTypeService.getAll();
    expect(result[0].laborType).toBe('통신설비공');
    expect(result[0].installHoursPerUnit).toBe(0.5);
    expect(result[0].removeHoursPerUnit).toBe(0.25);
    expect(result[0].relocateHoursPerUnit).toBeNull();
  });

  it('create 는 항상 role=device 로 만들고 categoryId 를 싣는다', async () => {
    vi.mocked(prisma.assetType.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.assetType.aggregate).mockResolvedValue({ _max: { sortOrder: 5 } } as any);
    vi.mocked(prisma.assetType.create).mockImplementation(
      async (args: any) => row({ ...args.data }) as any,
    );
    await assetTypeService.create({ name: '새장치', categoryId: 'c2' });
    const data = vi.mocked(prisma.assetType.create).mock.calls[0][0].data as any;
    expect(data.role).toBe('device');
    expect(data.categoryId).toBe('c2');
  });

  it('update 는 role-bearing(≠device) 의 분류 변경을 거부한다', async () => {
    vi.mocked(prisma.assetType.findUnique).mockResolvedValue(row({ role: 'rack' }) as any);
    await expect(
      assetTypeService.update('id1', { categoryId: 'c9' }),
    ).rejects.toThrow('분류를 변경할 수 없습니다');
  });

  it('update 는 device 의 분류 변경을 허용한다', async () => {
    vi.mocked(prisma.assetType.findUnique).mockResolvedValue(row({ role: 'device' }) as any);
    vi.mocked(prisma.assetType.update).mockResolvedValue(row({ role: 'device', categoryId: 'c9' }) as any);
    const res = await assetTypeService.update('id1', { categoryId: 'c9' });
    expect(res.categoryId).toBe('c9');
  });

  it('delete 는 role-bearing 을 차단한다', async () => {
    vi.mocked(prisma.assetType.findUnique).mockResolvedValue(row({ role: 'ofd' }) as any);
    await expect(assetTypeService.delete('id1')).rejects.toThrow('삭제할 수 없습니다');
  });

  it('delete 는 device 가 사용 중이면 차단한다', async () => {
    vi.mocked(prisma.assetType.findUnique).mockResolvedValue(row({ role: 'device' }) as any);
    vi.mocked(prisma.asset.count).mockResolvedValue(3);
    await expect(assetTypeService.delete('id1')).rejects.toThrow('사용 중인 자산');
  });

  it('delete 는 미사용 device 를 삭제한다', async () => {
    vi.mocked(prisma.assetType.findUnique).mockResolvedValue(row({ role: 'device' }) as any);
    vi.mocked(prisma.asset.count).mockResolvedValue(0);
    await assetTypeService.delete('id1');
    expect(prisma.assetType.delete).toHaveBeenCalledWith({ where: { id: 'id1' } });
  });
});
