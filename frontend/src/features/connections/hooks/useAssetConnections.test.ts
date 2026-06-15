import { describe, it, expect } from 'vitest';
import { buildConnectionGroups } from './useAssetConnections';
import type { TraceGraph } from '../../trace/traceGraph';
import type { TraceProjection } from '../../trace/traceProjection';
import type { Asset } from '../../../types/asset';

const assets = [
  { id: 'R', name: '#1랙', parentAssetId: null, assetType: { placementKind: 'RACK' } },
  { id: 'M', name: '송광치', parentAssetId: 'R', slotIndex: 0, assetType: {} },
  { id: 'S', name: '슬롯1', parentAssetId: 'OFD', assetType: { connectionKind: 'conduit' } },
  { id: 'OFD', name: 'OFD#1', parentAssetId: null, assetType: { placementKind: 'OFD' } },
] as unknown as Asset[];
const graph = {
  assets: [{ id: 'M', connectionKind: null }, { id: 'S', connectionKind: 'conduit' }, { id: 'OFD', connectionKind: null }],
  cables: [
    { id: 'c1', cableType: 'FIBER', sourceAssetId: 'M', targetAssetId: 'S', categoryId: 'fib', displayColor: '#a0f' },
    { id: 'c1b', cableType: 'FIBER', sourceAssetId: 'M', targetAssetId: 'S2', categoryId: 'fib', displayColor: '#a0f' },
  ],
  nameById: new Map([['M', '송광치'], ['S', '슬롯1'], ['OFD', 'OFD#1']]),
  subNameById: new Map(), parentById: new Map([['S', 'OFD']]), codeById: new Map(),
} as unknown as TraceGraph;
const proj = (seed: string): TraceProjection | null => ({
  seedCableId: seed, nodeIds: ['M', 'OFD'], cableIds: [seed],
  steps: [
    { id: 'M', label: '송광치', isEndpoint: true, isFiberEdge: false },
    { id: 'OFD', label: 'OFD#1', isEndpoint: true, isFiberEdge: false },
  ],
  nodes: [], edges: [], rings: [], seedFiberEdgeId: null, truncated: false,
}) as unknown as TraceProjection;
const catGroupOf = () => ({ label: '광', color: '#a0f', key: '광' });

describe('buildConnectionGroups', () => {
  it('보유자산(모듈) 케이블 → 종류 그룹 + 출발→도착 + 링 중복제거', () => {
    const groups = buildConnectionGroups({ graph, assets, assetId: 'R', projectFn: proj, categoryGroupOf: catGroupOf });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: '광', label: '광', color: '#a0f' });
    expect(groups[0].rows).toHaveLength(1);
    expect(groups[0].rows[0]).toMatchObject({ fromName: '송광치', toName: 'OFD#1', truncated: false });
  });
  it('self set 밖 케이블은 제외', () => {
    const g2 = { ...graph, cables: [{ id: 'x', cableType: 'FIBER', sourceAssetId: 'OTHER', targetAssetId: 'ELSE', categoryId: 'fib' }] } as unknown as TraceGraph;
    expect(buildConnectionGroups({ graph: g2, assets, assetId: 'R', projectFn: proj, categoryGroupOf: catGroupOf })).toEqual([]);
  });
});
