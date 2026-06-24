import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/api', () => ({
  api: { post: vi.fn().mockResolvedValue({ data: {} }), get: vi.fn().mockResolvedValue({ data: { data: [] } }) },
}));

import { useCatalogStore, newCatalogId } from './catalogStore';
import { api } from '../../utils/api';

const mk = (id: string, name: string, role = 'device'): never =>
  ({ id, code: id, name, group: null, role, categoryId: null, isContainer: false, fieldTemplate: null, requiredToCreate: null, iconName: null, displayColor: null, placementKind: null, connectionKind: null, sortOrder: 0, isActive: true }) as never;

beforeEach(() => {
  useCatalogStore.setState({ baseTypes: [], baseCategories: [], baseCableGroups: [], baseCableCategories: [] } as never);
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

  it('stageCreateCableGroup → effective + dirty', () => {
    const id = newCatalogId();
    useCatalogStore.getState().stageCreateCableGroup({ id, name: '전원', color: '#ef4444', sortOrder: 0, isActive: true });
    expect(useCatalogStore.getState().effectiveCableGroups().some((g) => g.id === id)).toBe(true);
    expect(useCatalogStore.getState().dirtyCount()).toBe(1);
  });

  it('commit 이 cableGroups 델타 포함', async () => {
    useCatalogStore.getState().stageCreateCableGroup({ id: newCatalogId(), name: 'G', color: null, sortOrder: 0, isActive: true, kind: null, laborType: null, installHoursPerMeter: null, removeHoursPerMeter: null, relocateHoursPerMeter: null });
    await useCatalogStore.getState().commit();
    expect(api.post).toHaveBeenCalledWith('/catalog/commit', expect.objectContaining({
      cableGroups: expect.objectContaining({ creates: expect.any(Array) }),
    }));
  });

  it('stageUpdateCableGroup 노무 patch → commit 에 installHoursPerMeter 전달', async () => {
    const id = 'cg-labor-1';
    useCatalogStore.setState({
      baseCableGroups: [{ id, name: '전원', color: '#ef4444', sortOrder: 0, isActive: true, kind: null, laborType: null, installHoursPerMeter: null, removeHoursPerMeter: null, relocateHoursPerMeter: null }],
    } as never);
    useCatalogStore.getState().stageUpdateCableGroup(id, { installHoursPerMeter: 0.05 });
    await useCatalogStore.getState().commit();
    const postedBody = vi.mocked(api.post).mock.calls[0][1] as { cableGroups: { updates: { id: string; patch: { installHoursPerMeter?: number } }[] } };
    expect(postedBody.cableGroups.updates[0].patch.installHoursPerMeter).toBe(0.05);
  });

  it('stageUpdateType 노무 patch → commit 에 installHoursPerUnit 전달', async () => {
    const id = 'type-labor-1';
    useCatalogStore.setState({
      baseTypes: [{ id, code: 'T1', name: '테스트종류', group: null, role: 'device', categoryId: null, isContainer: false, fieldTemplate: null, requiredToCreate: null, iconName: null, displayColor: null, placementKind: null, connectionKind: null, sortOrder: 0, isActive: true, laborType: null, installHoursPerUnit: null, removeHoursPerUnit: null, relocateHoursPerUnit: null }],
    } as never);
    useCatalogStore.getState().stageUpdateType(id, { installHoursPerUnit: 1.5 });
    await useCatalogStore.getState().commit();
    const postedBody = vi.mocked(api.post).mock.calls[0][1] as { assetTypes: { updates: { id: string; patch: { installHoursPerUnit?: number } }[] } };
    expect(postedBody.assetTypes.updates[0].patch.installHoursPerUnit).toBe(1.5);
  });
});
