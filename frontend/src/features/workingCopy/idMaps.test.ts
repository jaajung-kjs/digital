import { describe, it, expect } from 'vitest';
import { buildIdMaps, resolveId, resolveModuleId, resolveCircuitId } from './idMaps';

describe('buildIdMaps', () => {
  it('빈 응답 → 빈 Map 3개', () => {
    const maps = buildIdMaps({});
    expect(maps.equipment.size).toBe(0);
    expect(maps.rackModule.size).toBe(0);
    expect(maps.distCircuit.size).toBe(0);
  });

  it('각 카테고리별로 tempId → realId Map 생성', () => {
    const maps = buildIdMaps({
      equipmentIdMap: { 'temp-eq-1': 'real-eq-1' },
      rackModuleIdMap: { 'temp-mod-1': 'real-mod-1' },
      distCircuitIdMap: { 'temp-c-1': 'real-c-1' },
    });
    expect(maps.equipment.get('temp-eq-1')).toBe('real-eq-1');
    expect(maps.rackModule.get('temp-mod-1')).toBe('real-mod-1');
    expect(maps.distCircuit.get('temp-c-1')).toBe('real-c-1');
  });
});

describe('resolveId 계열', () => {
  const maps = buildIdMaps({
    equipmentIdMap: { 'temp-eq-1': 'real-eq-1' },
    rackModuleIdMap: { 'temp-mod-1': 'real-mod-1' },
    distCircuitIdMap: { 'temp-c-1': 'real-c-1' },
  });

  it('resolveId: temp 면 real 반환, 아니면 그대로', () => {
    expect(resolveId('temp-eq-1', maps)).toBe('real-eq-1');
    expect(resolveId('real-eq-existing', maps)).toBe('real-eq-existing');
  });

  it('resolveModuleId 도 동일', () => {
    expect(resolveModuleId('temp-mod-1', maps)).toBe('real-mod-1');
    expect(resolveModuleId('unrelated', maps)).toBe('unrelated');
  });

  it('resolveCircuitId 도 동일', () => {
    expect(resolveCircuitId('temp-c-1', maps)).toBe('real-c-1');
    expect(resolveCircuitId('unrelated', maps)).toBe('unrelated');
  });
});
