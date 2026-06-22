import { describe, it, expect } from 'vitest';
import { buildRouteCreate, buildCoreOutCable, routeDeleteIds } from './fiberWrite';

describe('fiberWrite', () => {
  it('buildRouteCreate: 슬롯2 + OPGW(IN-IN, cores) — 슬롯은 conduit·각 OFD 자식·대국명', () => {
    const r = buildRouteCreate({
      localOfd: { id: 'ofdW', substationId: 'subW', substationName: '원주S/S' },
      remoteOfd: { id: 'ofdH', substationId: 'subH', substationName: '홍천S/S' },
      cores: 24, slotTypeId: 'AT_SLOT', opgwCategory: { id: 'CAT_OPGW', code: 'CBL-OPGW', name: 'OPGW', displayColor: '#000' },
      ids: { slotA: 't-slotA', slotB: 't-slotB', opgw: 't-opgw' },
    });
    expect(r.slots).toHaveLength(2);
    const a = r.slots.find((s) => s.id === 't-slotA')!;
    expect(a.parentAssetId).toBe('ofdW');
    expect(a.substationId).toBe('subW');
    expect(a.name).toBe('홍천S/S');                 // 대국명
    expect(a.assetType.connectionKind).toBe('conduit');
    expect(a.assetType.code).toBe('OFD-SLOT');
    expect(r.opgw.sourceAssetId).toBe('t-slotA');
    expect(r.opgw.targetAssetId).toBe('t-slotB');
    expect(r.opgw.sourceRole).toBe('IN');
    expect(r.opgw.targetRole).toBe('IN');
    expect(r.opgw.cableType).toBe('FIBER');
    expect((r.opgw.specParams as { cores: number }).cores).toBe(24);
  });

  it('buildCoreOutCable: 설비↔슬롯, 슬롯 끝 OUT·number=코어, fiberPathId 없음', () => {
    const c = buildCoreOutCable({
      id: 't-out', equipmentId: 'eqA', slotId: 'slotA', coreNumber: 5,
      category: { id: 'CAT_OPT', code: 'CBL-OPT', name: '광케이블', displayColor: '#11f' },
      pathPoints: [[0, 0], [1, 1]], pathLength: 1, bufferLength: 4, totalLength: 5,
    });
    expect(c.sourceAssetId).toBe('eqA');
    expect(c.targetAssetId).toBe('slotA');
    expect(c.targetRole).toBe('OUT');        // 슬롯 끝 = OUT
    expect(c.sourceRole).toBe(null);
    expect(c.number).toBe(5);
    expect(c.cableType).toBe('FIBER');
    expect('fiberPathId' in c ? c.fiberPathId : null).toBeFalsy();
  });


  it('routeDeleteIds: 슬롯2 + OPGW + 그 슬롯들의 OUT 케이블 모두', () => {
    const ids = routeDeleteIds('slotA', 'slotB', [
      { id: 'opgw', sourceAssetId: 'slotA', targetAssetId: 'slotB', sourceRole: 'IN', targetRole: 'IN', cableType: 'FIBER' },
      { id: 'o1', sourceAssetId: 'eqA', targetAssetId: 'slotA', targetRole: 'OUT', cableType: 'FIBER' },
      { id: 'o2', sourceAssetId: 'eqB', targetAssetId: 'slotB', targetRole: 'OUT', cableType: 'FIBER' },
      { id: 'x', sourceAssetId: 'eqC', targetAssetId: 'eqD', cableType: 'AC' },
    ]);
    expect(ids.assetIds.sort()).toEqual(['slotA', 'slotB']);
    expect(ids.cableIds.sort()).toEqual(['o1', 'o2', 'opgw']);
  });
});
