import { describe, it, expect, vi, beforeEach } from 'vitest';
import { commitCatalog } from '../src/services/catalogCommit.service.js';

const tx = {
  assetCategory: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
  assetType: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
  asset: { count: vi.fn() },
};
vi.mock('../src/config/prisma.js', () => ({
  default: { $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)) },
}));

beforeEach(() => {
  vi.clearAllMocks();
  tx.asset.count.mockResolvedValue(0);
  tx.assetType.count.mockResolvedValue(0);
});

describe('commitCatalog', () => {
  it('카테고리 생성 후 그 id 로 타입 생성(원자, FK 순서)', async () => {
    await commitCatalog({
      assetCategories: { creates: [{ id: 'cat-1', name: '광전송' }], updates: [], deletes: [] },
      assetTypes: { creates: [{ id: 'type-1', name: '송변전광단말', categoryId: 'cat-1' }], updates: [], deletes: [] },
    });
    expect(tx.assetCategory.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ id: 'cat-1', name: '광전송' }) }));
    const typeData = (tx.assetType.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(typeData).toMatchObject({ id: 'type-1', name: '송변전광단말', categoryId: 'cat-1', role: 'device' });
    expect(typeData.code).toMatch(/^MOD-/);
  });

  it('role 보유 타입 삭제는 차단', async () => {
    tx.assetType.findUnique.mockResolvedValue({ id: 't', role: 'ofd' });
    await expect(commitCatalog({ assetTypes: { creates: [], updates: [], deletes: [{ id: 't' }] } }))
      .rejects.toThrow('삭제할 수 없습니다');
  });

  it('device 타입 사용 중이면 삭제 차단', async () => {
    tx.assetType.findUnique.mockResolvedValue({ id: 't', role: 'device' });
    tx.asset.count.mockResolvedValue(2);
    await expect(commitCatalog({ assetTypes: { creates: [], updates: [], deletes: [{ id: 't' }] } }))
      .rejects.toThrow('사용 중');
  });

  it('role 보유 타입 분류 변경은 차단', async () => {
    tx.assetType.findUnique.mockResolvedValue({ id: 't', role: 'rack' });
    await expect(commitCatalog({ assetTypes: { creates: [], updates: [{ id: 't', patch: { categoryId: 'c9' } }], deletes: [] } }))
      .rejects.toThrow('분류를 변경할 수 없습니다');
  });
});
