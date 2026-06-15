import { describe, it, expect } from 'vitest';
import { buildConnectionGroups } from './useAssetConnections';
import type { TraceGraph } from '../../trace/traceGraph';
import type { Asset } from '../../../types/asset';

const assets = [
  { id: 'R', name: '#1랙', parentAssetId: null, assetType: { placementKind: 'RACK' } },
  { id: 'M', name: '송광치', parentAssetId: 'R', slotIndex: 0, assetType: {} },
  { id: 'S', name: '슬롯1', parentAssetId: 'OFD', assetType: { connectionKind: 'conduit' } },
  { id: 'S2', name: '슬롯2', parentAssetId: 'OFD', assetType: { connectionKind: 'conduit' } },
  { id: 'OFD', name: 'OFD#1', parentAssetId: null, assetType: { placementKind: 'OFD' } },
  { id: 'F', name: '피더1', parentAssetId: null, assetType: { connectionKind: 'distributor' } },
  { id: 'SRC', name: '변압기', parentAssetId: null, assetType: {} },
  { id: 'L1', name: '부하1', parentAssetId: null, assetType: {} },
  { id: 'L2', name: '부하2', parentAssetId: null, assetType: {} },
] as unknown as Asset[];

const baseGraph = {
  assets: [
    { id: 'M', connectionKind: null }, { id: 'S', connectionKind: 'conduit' },
    { id: 'S2', connectionKind: 'conduit' }, { id: 'OFD', connectionKind: null },
    { id: 'F', connectionKind: 'distributor' }, { id: 'SRC', connectionKind: null },
    { id: 'L1', connectionKind: null }, { id: 'L2', connectionKind: null },
  ],
  nameById: new Map([['M', '송광치'], ['S', '슬롯1'], ['S2', '슬롯2'], ['OFD', 'OFD#1'], ['F', '피더1'], ['SRC', '변압기'], ['L1', '부하1'], ['L2', '부하2']]),
  subNameById: new Map(),
  parentById: new Map([['S', 'OFD'], ['S2', 'OFD']]),
  codeById: new Map(),
} as unknown as TraceGraph;

const withCables = (cables: unknown[]) => ({ ...baseGraph, cables } as unknown as TraceGraph);

const catGroupOf = (c: { categoryId?: string | null }) => {
  const m: Record<string, { key: string; label: string; color: string | null }> = {
    fib: { key: '광', label: '광', color: '#a0f' },
    pwr: { key: '전원', label: '전원', color: '#f00' },
    gnd: { key: '접지', label: '접지', color: '#0a0' },
  };
  return (c.categoryId && m[c.categoryId]) || { key: '기타', label: '기타', color: null };
};

describe('buildConnectionGroups', () => {
  it('보유자산(모듈) 광케이블 → 종류 그룹 + 출발→도착, 같은 OFD로 가는 다중코어는 1행(링 중복제거)', () => {
    const graph = withCables([
      { id: 'c1', cableType: 'FIBER', sourceAssetId: 'M', targetAssetId: 'S', categoryId: 'fib' },
      { id: 'c1b', cableType: 'FIBER', sourceAssetId: 'M', targetAssetId: 'S2', categoryId: 'fib' },
    ]);
    const groups = buildConnectionGroups({ graph, assets, assetId: 'R', categoryGroupOf: catGroupOf });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: '광', label: '광', color: '#a0f' });
    expect(groups[0].rows).toHaveLength(1);
    expect(groups[0].rows[0]).toMatchObject({ fromName: '송광치', toName: 'OFD#1' });
  });

  it('self set 밖 케이블은 제외', () => {
    const graph = withCables([{ id: 'x', cableType: 'FIBER', sourceAssetId: 'OTHER', targetAssetId: 'ELSE', categoryId: 'fib' }]);
    expect(buildConnectionGroups({ graph, assets, assetId: 'R', categoryGroupOf: catGroupOf })).toEqual([]);
  });

  it('같은 두 끝(A↔B) 사이 전원·접지는 종류가 달라 각각 1행(종류 무시 중복제거 회귀 방지)', () => {
    const graph = withCables([
      { id: 'p', cableType: 'POWER', sourceAssetId: 'SRC', targetAssetId: 'F', categoryId: 'pwr' },
      { id: 'g', cableType: 'GROUND', sourceAssetId: 'SRC', targetAssetId: 'F', categoryId: 'gnd' },
    ]);
    const groups = buildConnectionGroups({ graph, assets, assetId: 'F', categoryGroupOf: catGroupOf });
    expect(groups.map((g) => g.key).sort()).toEqual(['전원', '접지']);
    expect(groups.find((g) => g.key === '전원')!.rows).toHaveLength(1);
    expect(groups.find((g) => g.key === '접지')!.rows).toHaveLength(1);
  });

  it('피더 입력(공급)과 분기(부하)는 도착이 달라 각각 보존(분기 누락 회귀 방지)', () => {
    const graph = withCables([
      { id: 'in', cableType: 'POWER', sourceAssetId: 'SRC', targetAssetId: 'F', sourceRole: 'OUT', targetRole: 'IN', categoryId: 'pwr' },
      { id: 'b1', cableType: 'POWER', sourceAssetId: 'F', targetAssetId: 'L1', sourceRole: 'OUT', targetRole: 'IN', categoryId: 'pwr' },
      { id: 'b2', cableType: 'POWER', sourceAssetId: 'F', targetAssetId: 'L2', sourceRole: 'OUT', targetRole: 'IN', categoryId: 'pwr' },
    ]);
    const groups = buildConnectionGroups({ graph, assets, assetId: 'F', categoryGroupOf: catGroupOf });
    expect(groups).toHaveLength(1);
    const rows = groups[0].rows;
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.fromName === '피더1')).toBe(true);
    expect(new Set(rows.map((r) => r.toName))).toEqual(new Set(['변압기', '부하1', '부하2']));
  });
});
