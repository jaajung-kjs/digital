import { describe, expect, it } from 'vitest';
import type { V2AssetType, V2ContainerSpec } from '../types';
import { acceptedTypes, freeSlots, makeNewAsset } from '../newAsset';

const mkType = (id: string, key: string, categoryId: string): V2AssetType => ({
  id, key, name: key, categoryId, sortOrder: 1, isActive: true, assetCount: 0, placeable: false,
  defaultWidth: null, defaultHeight: null, laborType: null, installHours: 0, removeHours: 0, relocateHours: 0,
  fieldDefs: [], containerSpecs: [], portTemplates: [], linkRules: [],
});
const catKeyById = new Map([['c-comm', '통신'], ['c-struct', '구조']]);

describe('acceptedTypes', () => {
  const types = [mkType('t1', 'PITR', 'c-comm'), mkType('t2', 'RACK', 'c-struct')];
  it('categoryKeys 매칭', () => {
    const spec: V2ContainerSpec = { id: 's', key: 'main', name: '슬롯', slotCount: 12, allowSpan: true, accepts: { categoryKeys: ['통신'] }, sortOrder: 0 };
    expect(acceptedTypes(spec, types, catKeyById).map((t) => t.key)).toEqual(['PITR']);
  });
  it('typeKeys OR 매칭 + 빈 accepts 전체', () => {
    const spec: V2ContainerSpec = { id: 's', key: 'main', name: '슬롯', slotCount: null, allowSpan: false, accepts: { typeKeys: ['RACK'] }, sortOrder: 0 };
    expect(acceptedTypes(spec, types, catKeyById).map((t) => t.key)).toEqual(['RACK']);
    expect(acceptedTypes({ ...spec, accepts: {} }, types, catKeyById)).toHaveLength(2);
  });
});

describe('freeSlots', () => {
  const spec: V2ContainerSpec = { id: 's', key: 'main', name: '슬롯', slotCount: 6, allowSpan: true, accepts: {}, sortOrder: 0 };
  it('점유(span 포함) 제외한 빈 슬롯', () => {
    expect(freeSlots(spec, [{ slotIndex: 0, slotSpan: 2 }, { slotIndex: 4, slotSpan: 1 }])).toEqual([2, 3, 5]);
  });
});

describe('makeNewAsset', () => {
  it('uuid id + 기본값 + container 배치 반영', () => {
    const a = makeNewAsset({ type: mkType('t1', 'PITR', 'c-comm'), name: '신규', substationId: 'ss', placement: { kind: 'container', parentAssetId: 'rack', containerKey: 'main', slotIndex: 3, slotSpan: 1 } });
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(a).toMatchObject({ name: '신규', typeId: 't1', status: 'normal', parentAssetId: 'rack', slotIndex: 3 });
  });
  it('floor placement 반영', () => {
    const a = makeNewAsset({ type: mkType('t1', 'RACK', 'c-struct'), name: '랙', substationId: 'ss',
      placement: { kind: 'floor', floorId: 'f1', x: 10, y: 20, width: 60, height: 80 } });
    expect(a).toMatchObject({ floorId: 'f1', x: 10, y: 20, width: 60, height: 80, parentAssetId: null });
  });
});
