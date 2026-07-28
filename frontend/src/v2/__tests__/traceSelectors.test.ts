import { describe, expect, it } from 'vitest';
import { buildTraceInputs, traceHighlight, expandToPlacedAncestors } from '../traceSelectors';

const cat = { id: 'cat-t', key: '통신', name: '통신', sortOrder: 1 };
const slotType = {
  id: 't-slot', key: 'OFD-SLOT', name: '광슬롯', categoryId: 'cat-t', sortOrder: 1, isActive: true,
  placeable: false, defaultWidth: null, defaultHeight: null, laborType: null, installHours: 0, removeHours: 0, relocateHours: 0,
  fieldDefs: [],
  containerSpecs: [],
  portTemplates: [
    { id: 'pt-a', group: 'A', count: 4, direction: 'BI', medium: 'fiber', namePattern: '성단 {n}', sortOrder: 0 },
    { id: 'pt-b', group: 'B', count: 4, direction: 'BI', medium: 'fiber', namePattern: '선로 {n}', sortOrder: 1 },
  ],
  linkRules: [{ id: 'lr', fromGroup: 'A', toGroup: 'B', mapping: 'byIndex' }],
};
const devType = { ...slotType, id: 't-dev', key: 'DEV-X', portTemplates: [{ id: 'pt-p', group: 'P', count: 2, direction: 'BI', medium: 'fiber', namePattern: '포트 {n}', sortOrder: 0 }], linkRules: [] };

const mkPort = (id: string, assetId: string, group: string, index: number) => ({ id, assetId, group, index, name: `${group}${index}`, direction: 'BI' as const, medium: 'fiber' });
const mkAsset = (id: string, typeId: string, ports: ReturnType<typeof mkPort>[]) => ({
  id, name: id, typeId, substationId: 's', status: 'normal', floorId: null, x: null, y: null, width: null, height: null,
  parentAssetId: null, containerKey: null, slotIndex: null, slotSpan: null, fieldValues: {}, updatedAt: '', ports,
});

const assets = [
  mkAsset('dev1', 't-dev', [mkPort('d1p1', 'dev1', 'P', 1)]),
  mkAsset('slot1', 't-slot', [mkPort('s1a3', 'slot1', 'A', 3), mkPort('s1b3', 'slot1', 'B', 3), mkPort('s1b4', 'slot1', 'B', 4)]),
  mkAsset('dev2', 't-dev', [mkPort('d2p1', 'dev2', 'P', 1)]),
];
const cables = [
  { id: 'c1', name: null, substationId: 's', aPortId: 'd1p1', bPortId: 's1a3', categoryId: null, pathPoints: [], specParams: {}, updatedAt: 'v' },
  { id: 'c2', name: null, substationId: 's', aPortId: 's1b3', bPortId: 'd2p1', categoryId: null, pathPoints: [], specParams: {}, updatedAt: 'v' },
];

describe('expandToPlacedAncestors', () => {
  it('추적 자산의 조상 체인 포함 확장', () => {
    const assets = [
      { id: 'ofd', parentAssetId: null },
      { id: 'slot', parentAssetId: 'ofd' },
      { id: 'sub', parentAssetId: 'slot' },
      { id: 'other', parentAssetId: null },
    ];
    expect(expandToPlacedAncestors(new Set(['sub']), assets)).toEqual(new Set(['sub', 'slot', 'ofd']));
    expect(expandToPlacedAncestors(new Set(['ofd']), assets)).toEqual(new Set(['ofd']));
  });
});

describe('traceHighlight — OFD 채널 보존 (V2→코어 배선)', () => {
  it('dev1 포트에서 시작 → 슬롯 내부(byIndex) 경유 → dev2까지', () => {
    const inputs = buildTraceInputs({ types: [slotType, devType] as never, categories: [cat] as never, assets: assets as never, cables: cables as never });
    const r = traceHighlight(inputs, 'd1p1');
    expect(r.assetIds).toEqual(new Set(['dev1', 'slot1', 'dev2']));
    expect(r.cableIds).toEqual(new Set(['c1', 'c2']));
    expect(r.hops.map((h) => h.kind)).toEqual(['cable', 'internal', 'cable']);
  });
});
