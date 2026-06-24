import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/api', () => ({
  api: { post: vi.fn().mockResolvedValue({ data: {} }), get: vi.fn().mockResolvedValue({ data: { data: [] } }) },
}));

import { useCatalogStore, newCatalogId } from './catalogStore';
import { api } from '../../utils/api';

const mk = (id: string, name: string, role = 'device'): never =>
  ({ id, code: id, name, group: null, role, categoryId: null, isContainer: false, fieldTemplate: null, requiredToCreate: null, iconName: null, displayColor: null, placementKind: null, connectionKind: null, sortOrder: 0, isActive: true }) as never;

beforeEach(() => {
  useCatalogStore.setState({ baseTypes: [], baseCategories: [] } as never);
  useCatalogStore.getState().discard();
  vi.clearAllMocks();
  vi.mocked(api.get).mockResolvedValue({ data: { data: [] } } as never);
  vi.mocked(api.post).mockResolvedValue({ data: {} } as never);
});

describe('catalogStore', () => {
  it('stageCreateType → effective 반영, dirty 1', () => {
    const id = newCatalogId();
    useCatalogStore.getState().stageCreateType(mk(id, '새종류'));
    expect(useCatalogStore.getState().effectiveTypes().some((t) => t.id === id)).toBe(true);
    expect(useCatalogStore.getState().dirtyCount()).toBe(1);
  });

  it('stageDeleteType(기존) → effective 에서 제외', () => {
    useCatalogStore.setState({ baseTypes: [mk('t1', '기존') as never] } as never);
    useCatalogStore.getState().stageDeleteType('t1', false);
    expect(useCatalogStore.getState().effectiveTypes().some((t) => t.id === 't1')).toBe(false);
  });

  it('commit() 이 delta 로 POST /catalog/commit', async () => {
    const id = newCatalogId();
    useCatalogStore.getState().stageCreateType(mk(id, 'X'));
    await useCatalogStore.getState().commit();
    expect(api.post).toHaveBeenCalledWith('/catalog/commit', expect.objectContaining({
      assetTypes: expect.objectContaining({ creates: expect.arrayContaining([expect.objectContaining({ id, name: 'X' })]) }),
    }));
  });

  it('discard → dirty 0', () => {
    useCatalogStore.getState().stageCreateType(mk(newCatalogId(), 'Y'));
    useCatalogStore.getState().discard();
    expect(useCatalogStore.getState().dirtyCount()).toBe(0);
  });
});
