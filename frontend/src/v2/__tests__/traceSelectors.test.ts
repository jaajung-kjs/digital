import { describe, expect, it } from 'vitest';
import { buildTraceInputs, traceHighlight, expandToPlacedAncestors } from '../traceSelectors';
import { endpointRef } from '../peerResolve';

const cat = { id: 'cat-t', key: '통신', name: '통신', sortOrder: 1 };
const slotType = {
  id: 't-slot', key: 'OFD-SLOT', name: '광슬롯', categoryId: 'cat-t', sortOrder: 1, isActive: true,
  placeable: false, defaultWidth: null, defaultHeight: null, laborType: null, installHours: 0, removeHours: 0, relocateHours: 0,
  containerSpecs: [],
  portTemplates: [
    { id: 'pt-a', group: 'A', count: 4, direction: 'BI', medium: 'fiber', namePattern: '장비 {n}', sortOrder: 0, positions: 1 },
    { id: 'pt-b', group: 'B', count: 1, direction: 'BI', medium: 'fiber-trunk', namePattern: '광 인입', sortOrder: 1, positions: 4 },
  ],
};
const devType = { ...slotType, id: 't-dev', key: 'DEV-X', portTemplates: [{ id: 'pt-p', group: 'P', count: 2, direction: 'BI', medium: 'fiber', namePattern: '포트 {n}', sortOrder: 0, positions: 1 }] };

const mkPort = (id: string, assetId: string, group: string, index: number, medium = 'fiber', positions = 1) =>
  ({ id, assetId, group, index, name: `${group}${index}`, direction: 'BI' as const, medium, positions, fieldValues: {} });
const mkAsset = (id: string, typeId: string, ports: ReturnType<typeof mkPort>[]) => ({
  id, name: id, typeId, substationId: 's', status: 'normal', floorId: null, x: null, y: null, width: null, height: null,
  parentAssetId: null, containerKey: null, col: null, row: null, colSpan: null, rowSpan: null, fieldValues: {}, updatedAt: '', ports,
});

const assets = [
  mkAsset('dev1', 't-dev', [mkPort('d1p1', 'dev1', 'P', 1)]),
  mkAsset('slot1', 't-slot', [mkPort('s1a3', 'slot1', 'A', 3), mkPort('s1a4', 'slot1', 'A', 4), mkPort('s1b1', 'slot1', 'B', 1, 'fiber-trunk', 4)]),
  mkAsset('dev2', 't-dev', [mkPort('d2p1', 'dev2', 'P', 1)]),
];
const cables = [
  { id: 'c1', name: null, substationId: 's', aPortId: 'd1p1', bPortId: 's1a3', categoryId: null, pathPoints: [], specParams: {}, updatedAt: 'v' },
  { id: 'c2', name: null, substationId: 's', aPortId: 's1b1', bPortId: 'd2p1', categoryId: null, pathPoints: [], specParams: {}, updatedAt: 'v' },
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

/**
 * endpointRef 방향 검증 (I-1/I-2) — ConnectionsTab hopText가 사용하는 실제 프로덕션 헬퍼.
 *
 * trace hop의 toPortId가 케이블 bPortId면 bRef(그 포트 자신을 기술하는 ref),
 * aPortId면 aRef를 반환해야 한다. resolvePeer의 '반대편(peer)' 규칙과 반대 방향.
 */
describe('endpointRef — 끝점 자신의 saved ref 판정 (hopText 방향)', () => {
  const mkRef = (assetName: string, substationName: string) => ({
    portName: 'p', portGroup: 'G', portIndex: 1, assetId: 'x',
    assetName, substationId: 'sub', substationName,
  });
  const cable = {
    aPortId: 'portA',
    bPortId: 'portB',
    aRef: mkRef('A측자산', 'A변전소'),
    bRef: mkRef('B측자산', 'B변전소'),
  };

  it('portId === bPortId 이면 bRef(B측 자산) 반환', () => {
    expect(endpointRef(cable, 'portB')?.assetName).toBe('B측자산');
  });

  it('portId === aPortId 이면 aRef(A측 자산) 반환', () => {
    expect(endpointRef(cable, 'portA')?.assetName).toBe('A측자산');
  });

  it('케이블에 속하지 않는 portId 이면 null', () => {
    expect(endpointRef(cable, 'portX')).toBeNull();
  });

  it('해당 측 ref가 없으면 null', () => {
    expect(endpointRef({ aPortId: 'portA', bPortId: 'portB' }, 'portB')).toBeNull();
  });
});

describe('traceHighlight — OFD 코어 보존 (V2→코어 배선)', () => {
  it('dev1 포트에서 시작 → 슬롯 인입 경유 → dev2까지', () => {
    const inputs = buildTraceInputs({ types: [slotType, devType] as never, categories: [cat] as never, assets: assets as never, cables: cables as never });
    const r = traceHighlight(inputs, 'd1p1');
    expect(r.assetIds).toEqual(new Set(['dev1', 'slot1', 'dev2']));
    expect(r.cableIds).toEqual(new Set(['c1', 'c2']));
    expect(r.hops.map((h) => h.kind)).toEqual(['cable', 'internal', 'cable']);
  });
});
