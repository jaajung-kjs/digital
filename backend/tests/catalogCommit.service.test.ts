import { describe, it, expect, vi, beforeEach } from 'vitest';
import { commitCatalog } from '../src/services/catalogCommit.service.js';

const tx = {
  assetCategory: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
  assetType: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
  asset: { count: vi.fn() },
  cableGroup: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
  cableCategory: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
  cable: { count: vi.fn() },
};
vi.mock('../src/config/prisma.js', () => ({
  default: { $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)) },
}));

beforeEach(() => {
  vi.clearAllMocks();
  tx.asset.count.mockResolvedValue(0);
  tx.assetType.count.mockResolvedValue(0);
  tx.cableCategory.count.mockResolvedValue(0);
  tx.cable.count.mockResolvedValue(0);
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

  it('그룹 생성 후 그 id 로 케이블종류 생성(name+groupId 만)', async () => {
    tx.cableGroup.findUnique.mockResolvedValue({ id: 'g1', name: '전원케이블' });
    await commitCatalog({
      cableGroups: { creates: [{ id: 'g1', name: '전원케이블', color: '#ef4444' }], updates: [], deletes: [] },
      cableCategories: { creates: [{ id: 'cc1', name: 'Fr-sq3.5', groupId: 'g1' }], updates: [], deletes: [] },
    });
    expect(tx.cableGroup.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ id: 'g1', name: '전원케이블', color: '#ef4444' }) }));
    const d = (tx.cableCategory.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(d).toMatchObject({ id: 'cc1', name: 'Fr-sq3.5', groupId: 'g1' });
    expect(d.code).toBeUndefined();
    expect(d.displayGroup).toBeUndefined();
  });

  it('사용 중 그룹 삭제 차단', async () => {
    tx.cableCategory.count.mockResolvedValue(2);
    await expect(commitCatalog({ cableGroups: { creates: [], updates: [], deletes: [{ id: 'g1' }] } })).rejects.toThrow('사용 중인 종류');
  });

  it('사용 중 케이블종류 삭제 차단', async () => {
    tx.cable.count.mockResolvedValue(3);
    await expect(commitCatalog({ cableCategories: { creates: [], updates: [], deletes: [{ id: 'cc1' }] } })).rejects.toThrow('사용 중인 케이블');
  });

  it('cableGroup update 가 installHoursPerMeter 를 tx update data 에 반영', async () => {
    await commitCatalog({
      cableGroups: { creates: [], updates: [{ id: 'g1', patch: { installHoursPerMeter: 0.05 } }], deletes: [] },
    });
    const updateData = (tx.cableGroup.update.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(updateData.installHoursPerMeter).toBe(0.05);
  });

  it('assetType update 가 installHoursPerUnit 를 tx update data 에 반영', async () => {
    tx.assetType.findUnique.mockResolvedValue({ id: 't1', role: 'device' });
    await commitCatalog({
      assetTypes: { creates: [], updates: [{ id: 't1', patch: { installHoursPerUnit: 1.5 } }], deletes: [] },
    });
    const updateData = (tx.assetType.update.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(updateData.installHoursPerUnit).toBe(1.5);
  });
});
