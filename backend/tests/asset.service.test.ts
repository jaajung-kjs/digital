import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assetService } from '../src/services/asset.service.js';
import prisma from '../src/config/prisma.js';

vi.mock('../src/config/prisma.js', () => ({
  default: {
    asset: {
      findMany: vi.fn(), findUnique: vi.fn(),
      create: vi.fn(), update: vi.fn(), delete: vi.fn(),
    },
  },
}));

const typeRel = { id: 't1', code: 'PITR', name: '계통보호전송장치', group: '통신', displayColor: '#6366f1', fieldTemplate: [] };

describe('AssetService', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('create 는 substation+type+name 으로 생성하고 audit 필드를 채운다', async () => {
    vi.mocked(prisma.asset.create).mockResolvedValue({
      id: 'a1', substationId: 's1', assetTypeId: 't1', name: 'PITR-1',
      parentAssetId: null, roomText: null, sourcePresetId: null, installDate: null,
      manager: null, description: null, status: null, sortOrder: 0, updatedAt: new Date(),
      assetType: typeRel,
    } as any);
    const out = await assetService.create(
      { substationId: 's1', assetTypeId: 't1', name: 'PITR-1' }, 'u1',
    );
    expect(out.name).toBe('PITR-1');
    expect(out.assetType.code).toBe('PITR');
    const arg = vi.mocked(prisma.asset.create).mock.calls[0][0];
    expect((arg as any).data.createdById).toBe('u1');
    expect((arg as any).data.updatedById).toBe('u1');
  });

  it('listBySubstation 은 변전소 자산을 sortOrder 순으로 반환', async () => {
    vi.mocked(prisma.asset.findMany).mockResolvedValue([
      { id: 'a1', substationId: 's1', assetTypeId: 't1', name: 'PITR-1',
        parentAssetId: null, roomText: null, sourcePresetId: null, installDate: null,
        manager: null, description: null, status: null, sortOrder: 0, updatedAt: new Date(), assetType: typeRel },
    ] as any);
    const out = await assetService.listBySubstation('s1');
    expect(out).toHaveLength(1);
    expect(prisma.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { substationId: 's1' } }),
    );
  });

  it('update 는 대상이 없으면 NotFoundError', async () => {
    vi.mocked(prisma.asset.findUnique).mockResolvedValue(null);
    await expect(assetService.update('nope', { name: 'X' }, 'u1')).rejects.toThrow('찾을 수 없습니다');
  });

  it('update 는 warrantyUntil/replaceDue 를 Date 로 저장한다', async () => {
    vi.mocked(prisma.asset.findUnique).mockResolvedValue({ id: 'a1' } as any);
    vi.mocked(prisma.asset.update).mockResolvedValue({
      id: 'a1', substationId: 's1', assetTypeId: 't1', name: 'X',
      parentAssetId: null, roomText: null, sourcePresetId: null, installDate: null,
      manager: null, description: null, status: null, sortOrder: 0, updatedAt: new Date(),
      warrantyUntil: new Date('2026-12-31'), replaceDue: new Date('2027-06-30'),
      assetType: { id: 't1', code: 'RTU', name: 'RTU', group: '통신', displayColor: '#000', fieldTemplate: [] },
    } as any);
    await assetService.update('a1', { warrantyUntil: '2026-12-31', replaceDue: '2027-06-30' }, 'u1');
    const arg = vi.mocked(prisma.asset.update).mock.calls[0][0] as any;
    expect(arg.data.warrantyUntil).toBeInstanceOf(Date);
    expect(arg.data.replaceDue).toBeInstanceOf(Date);
  });

  it('duplicate 는 원본 필드를 복사하고 이름에 (복제)를 붙인다', async () => {
    vi.mocked(prisma.asset.findUnique).mockResolvedValue({
      id: 'a1', substationId: 's1', assetTypeId: 't1', name: 'PITR-1',
      parentAssetId: null, roomText: 'ICT실', sourcePresetId: 'preset-1',
      installDate: null, manager: null, description: null, status: null, sortOrder: 0,
    } as any);
    vi.mocked(prisma.asset.create).mockResolvedValue({
      id: 'a2', substationId: 's1', assetTypeId: 't1', name: 'PITR-1 (복제)',
      parentAssetId: null, roomText: 'ICT실', sourcePresetId: 'preset-1',
      installDate: null, manager: null, description: null, status: null, sortOrder: 0, updatedAt: new Date(), assetType: typeRel,
    } as any);
    const out = await assetService.duplicate('a1', 'u1');
    expect(out.name).toBe('PITR-1 (복제)');
    const arg = vi.mocked(prisma.asset.create).mock.calls[0][0];
    expect((arg as any).data.roomText).toBe('ICT실');
    expect((arg as any).data.sourcePresetId).toBe('preset-1');
  });
});
