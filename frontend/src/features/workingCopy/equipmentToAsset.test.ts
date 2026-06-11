import { describe, it, expect } from 'vitest';
import { equipmentToAssetCreate, equipmentToAssetPatch } from './equipmentToAsset';

// #7: properties 캐리어는 sourcePresetId 만 보존 → Asset 전용 컬럼 sourcePresetId 로 매핑.
const eq = { id:'tmp1', kind:'RACK', name:'랙1', positionX:10, positionY:20, width:100, height:200, rotation:0, totalU:42, manager:'홍', installDate:'2024-01-01', description:'d', properties:{ sourcePresetId:'p1' } } as any;
describe('equipmentToAssetCreate', () => {
  it('FloorPlanEquipment → Asset(create)', () => {
    const a = equipmentToAssetCreate(eq, { substationId:'s1', floorId:'f1', assetTypeId:'t1', tempId:'tmp1' });
    expect(a).toMatchObject({ id:'tmp1', substationId:'s1', assetTypeId:'t1', floorId:'f1', name:'랙1', positionX:10, positionY:20, width2d:100, height2d:200, rotation:0, totalU:42, sourcePresetId:'p1' });
    expect(a.parentAssetId).toBeNull();
  });
});
describe('equipmentToAssetPatch', () => {
  it('존재하는 키만 매핑(width→width2d, properties.sourcePresetId→sourcePresetId)', () => {
    expect(equipmentToAssetPatch({ positionX:5, width:80, properties:{ sourcePresetId:'p2' } })).toEqual({ positionX:5, width2d:80, sourcePresetId:'p2' });
  });
  it('빈 패치 → 빈 객체', () => expect(equipmentToAssetPatch({})).toEqual({}));
});
