import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assetService, toSlimAsset } from '../src/services/asset.service.js';
import prisma from '../src/config/prisma.js';

vi.mock('../src/config/prisma.js', () => ({
  default: {
    asset: {
      findMany: vi.fn(), findUnique: vi.fn(),
    },
  },
}));

const typeRel = { id: 't1', name: '계통보호전송장치' };

describe('AssetService', () => {
  beforeEach(() => { vi.clearAllMocks(); });

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
});

describe('toSlimAsset role', () => {
  it('assetType.role 을 slim 에 싣는다', () => {
    const slim = toSlimAsset({
      id: 'a', name: 'OFD-1', substationId: 's', parentAssetId: null,
      assetType: { role: 'ofd' } as any,
    });
    expect(slim.role).toBe('ofd');
  });
});
