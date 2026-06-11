import { describe, it, expect } from 'vitest';
import { rackModuleToAssetCreate, rackModuleToAssetPatch } from './rackModuleToAsset';
// #7: properties 캐리어는 sourcePresetId 만 보존 → Asset 전용 컬럼으로 매핑.
const m = { id:'tm1', rackEquipmentId:'r1', categoryId:'cat1', name:'모듈', slotIndex:3, slotSpan:1, properties:{ sourcePresetId:'p1' } } as any;
describe('rackModuleToAssetCreate', () => {
  it('RackModule → Asset child', () => {
    const a = rackModuleToAssetCreate(m, { substationId:'s1', floorId:'f1', tempId:'tm1' });
    expect(a).toMatchObject({ id:'tm1', substationId:'s1', parentAssetId:'r1', assetTypeId:'cat1', name:'모듈', slotIndex:3, slotSpan:1, sourcePresetId:'p1' });
  });
});
describe('rackModuleToAssetPatch', () => {
  it('존재 키만 (slotIndex 이동)', () => expect(rackModuleToAssetPatch({ slotIndex:5 })).toEqual({ slotIndex:5 }));
});
