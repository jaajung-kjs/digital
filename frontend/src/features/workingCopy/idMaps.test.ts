import { describe, it, expect } from 'vitest';
import { buildIdMaps, resolveEquipmentId, resolveModuleId } from './idMaps';

describe('buildIdMaps', () => {
  it('빈 응답 → 빈 Map 2개', () => {
    const maps = buildIdMaps({});
    expect(maps.equipment.size).toBe(0);
    expect(maps.rackModule.size).toBe(0);
  });

  it('각 카테고리별로 tempId → realId Map 생성', () => {
    const maps = buildIdMaps({
      equipmentIdMap: { 'temp-eq-1': 'real-eq-1' },
      rackModuleIdMap: { 'temp-mod-1': 'real-mod-1' },
    });
    expect(maps.equipment.get('temp-eq-1')).toBe('real-eq-1');
    expect(maps.rackModule.get('temp-mod-1')).toBe('real-mod-1');
  });
});

describe('resolveId 계열', () => {
  const maps = buildIdMaps({
    equipmentIdMap: { 'temp-eq-1': 'real-eq-1' },
    rackModuleIdMap: { 'temp-mod-1': 'real-mod-1' },
  });

  it('resolveEquipmentId: temp 면 real 반환, 아니면 그대로', () => {
    expect(resolveEquipmentId('temp-eq-1', maps)).toBe('real-eq-1');
    expect(resolveEquipmentId('real-eq-existing', maps)).toBe('real-eq-existing');
  });

  it('resolveModuleId 도 동일', () => {
    expect(resolveModuleId('temp-mod-1', maps)).toBe('real-mod-1');
    expect(resolveModuleId('unrelated', maps)).toBe('unrelated');
  });
});
