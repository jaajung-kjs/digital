import { describe, it, expect } from 'vitest';
import { buildIdMaps } from './idMaps';
import { resolveCableIds, resolveRackModuleIds } from './resolvers';
import type { LocalCable } from '../editor/stores/editorStore';
import type { RackModule } from '../../types/rackModule';

const maps = buildIdMaps({
  equipmentIdMap: { 'temp-eq-A': 'real-eq-A' },
  rackModuleIdMap: { 'temp-mod-A': 'real-mod-A' },
  distCircuitIdMap: { 'temp-c-A': 'real-c-A' },
});

describe('resolveCableIds', () => {
  it('equipment endpoint 의 tempId 를 해석', () => {
    const cable = {
      id: 'cb-1',
      sourceEquipmentId: 'temp-eq-A',
      targetEquipmentId: 'real-eq-existing',
      sourceModuleId: null,
      targetModuleId: null,
      sourceCircuitId: null,
      targetCircuitId: null,
    } as LocalCable;
    const r = resolveCableIds(cable, maps);
    expect(r.sourceEquipmentId).toBe('real-eq-A');
    expect(r.targetEquipmentId).toBe('real-eq-existing');
  });

  it('module/circuit endpoint 의 tempId 도 해석, null 은 그대로', () => {
    const cable = {
      id: 'cb-2',
      sourceEquipmentId: 'real-eq-1',
      targetEquipmentId: 'real-eq-2',
      sourceModuleId: 'temp-mod-A',
      targetModuleId: null,
      sourceCircuitId: null,
      targetCircuitId: 'temp-c-A',
    } as LocalCable;
    const r = resolveCableIds(cable, maps);
    expect(r.sourceModuleId).toBe('real-mod-A');
    expect(r.targetModuleId).toBeNull();
    expect(r.sourceCircuitId).toBeNull();
    expect(r.targetCircuitId).toBe('real-c-A');
  });
});

describe('resolveRackModuleIds', () => {
  it('id 와 rackEquipmentId 모두 해석', () => {
    const m = {
      id: 'temp-mod-A',
      rackEquipmentId: 'temp-eq-A',
      categoryId: 'cat-1',
    } as RackModule;
    const r = resolveRackModuleIds(m, maps);
    expect(r.id).toBe('real-mod-A');
    expect(r.rackEquipmentId).toBe('real-eq-A');
  });
});
