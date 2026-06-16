import { describe, it, expect } from 'vitest';
import { buildConnectionGroups, makeCategoryGroupOf } from './useAssetConnections';
import type { TraceGraph } from '../../trace/traceGraph';
import type { Asset } from '../../../types/asset';
import type { CableCategory } from '../../../types/cableCategory';

const assets = [
  { id: 'R', name: '#1랙', parentAssetId: null, assetType: { placementKind: 'RACK' } },
  { id: 'M', name: '송광치', parentAssetId: 'R', slotIndex: 0, assetType: {} },
  { id: 'S', name: '슬롯1', parentAssetId: 'OFD', assetType: { connectionKind: 'conduit' } },
  { id: 'S2', name: '슬롯2', parentAssetId: 'OFD', assetType: { connectionKind: 'conduit' } },
  { id: 'OFD', name: 'OFD#1', parentAssetId: null, assetType: { placementKind: 'OFD' } },
  { id: 'RS', name: '원격슬롯', parentAssetId: 'ROFD', assetType: { connectionKind: 'conduit' } },
  { id: 'ROFD', name: '원격OFD', parentAssetId: null, assetType: { placementKind: 'OFD' } },
  { id: 'E1', name: '단말1', parentAssetId: null, assetType: {} },
  { id: 'F', name: '피더1', parentAssetId: null, assetType: { connectionKind: 'distributor' } },
  { id: 'SRC', name: '변압기', parentAssetId: null, assetType: {} },
  { id: 'L1', name: '부하1', parentAssetId: null, assetType: {} },
  { id: 'L2', name: '부하2', parentAssetId: null, assetType: {} },
] as unknown as Asset[];

const baseGraph = {
  assets: [
    { id: 'M', connectionKind: null }, { id: 'S', connectionKind: 'conduit' },
    { id: 'S2', connectionKind: 'conduit' }, { id: 'OFD', connectionKind: null },
    { id: 'RS', connectionKind: 'conduit' }, { id: 'ROFD', connectionKind: null }, { id: 'E1', connectionKind: null },
    { id: 'F', connectionKind: 'distributor' }, { id: 'SRC', connectionKind: null },
    { id: 'L1', connectionKind: null }, { id: 'L2', connectionKind: null },
  ],
  nameById: new Map([['M', '송광치'], ['S', '슬롯1'], ['S2', '슬롯2'], ['OFD', 'OFD#1'], ['RS', '원격슬롯'], ['ROFD', '원격OFD'], ['E1', '단말1'], ['F', '피더1'], ['SRC', '변압기'], ['L1', '부하1'], ['L2', '부하2']]),
  subNameById: new Map(),
  parentById: new Map([['S', 'OFD'], ['S2', 'OFD'], ['RS', 'ROFD']]),
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

  it('같은 도착에 전원·접지가 동시연결되면 종류가 달라 각각 1행(종류 무시 중복제거 회귀 방지)', () => {
    const graph = withCables([
      { id: 'p', cableType: 'POWER', sourceAssetId: 'F', targetAssetId: 'L1', sourceRole: 'OUT', targetRole: 'IN', categoryId: 'pwr' },
      { id: 'g', cableType: 'GROUND', sourceAssetId: 'F', targetAssetId: 'L1', sourceRole: 'OUT', targetRole: 'IN', categoryId: 'gnd' },
    ]);
    const groups = buildConnectionGroups({ graph, assets, assetId: 'F', categoryGroupOf: catGroupOf });
    expect(groups.map((g) => g.key).sort()).toEqual(['전원', '접지']);
    expect(groups.find((g) => g.key === '전원')!.rows).toHaveLength(1);
    expect(groups.find((g) => g.key === '접지')!.rows).toHaveLength(1);
  });

  it('피더(분배): 입력→출력들을 한 행으로 집계 — `입력상대 → 출력상대들`, branched + 트리 seed', () => {
    const graph = withCables([
      { id: 'in', cableType: 'POWER', sourceAssetId: 'SRC', targetAssetId: 'F', sourceRole: 'OUT', targetRole: 'IN', categoryId: 'pwr' },
      { id: 'b1', cableType: 'POWER', sourceAssetId: 'F', targetAssetId: 'L1', sourceRole: 'OUT', targetRole: 'IN', categoryId: 'pwr' },
      { id: 'b2', cableType: 'POWER', sourceAssetId: 'F', targetAssetId: 'L2', sourceRole: 'OUT', targetRole: 'IN', categoryId: 'pwr' },
    ]);
    const groups = buildConnectionGroups({ graph, assets, assetId: 'F', categoryGroupOf: catGroupOf });
    expect(groups).toHaveLength(1);
    const rows = groups[0].rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].fromName).toBe('변압기');           // 출발 = 입력(공급) 상대
    expect(rows[0].branched).toBe(true);
    expect(rows[0].toName.split(', ').sort()).toEqual(['부하1', '부하2']); // 도착 = 출력 상대들
    expect(rows[0].cableId).toBe('in');                 // seed = passive 끝(변압기) 가진 입력 → 트리 전체 하이라이트
  });

  it('분류된 광 + 미분류 FIBER 가 같은 곳으로 가면 1그룹(광)·1행으로 병합(시드 데이터 split 회귀 방지)', () => {
    const cats = [{ id: 'fib', displayGroup: '광', displayColor: '#22c55e', name: '광케이블' }] as unknown as CableCategory[];
    const graph = withCables([
      { id: 'cc', cableType: 'FIBER', sourceAssetId: 'M', targetAssetId: 'S', categoryId: 'fib' },  // 분류됨 → 광
      { id: 'cu', cableType: 'FIBER', sourceAssetId: 'M', targetAssetId: 'S2', categoryId: null },   // 미분류 → 폴백
    ]);
    const groups = buildConnectionGroups({ graph, assets, assetId: 'R', categoryGroupOf: makeCategoryGroupOf(cats) });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: '광', label: '광', color: '#22c55e' });
    expect(groups[0].rows).toHaveLength(1);
  });

  it('OFD(분배): OPGW 입력 → 출력(설비)을 한 행으로 — `입력상대 → 출력상대`', () => {
    const graph = withCables([
      { id: 'out1', cableType: 'FIBER', sourceAssetId: 'E1', targetAssetId: 'S', targetRole: 'OUT', categoryId: 'fib' },
      { id: 'opgw', cableType: 'FIBER', sourceAssetId: 'S', targetAssetId: 'RS', sourceRole: 'IN', targetRole: 'IN', categoryId: 'fib' },
    ]);
    const groups = buildConnectionGroups({ graph, assets, assetId: 'OFD', categoryGroupOf: catGroupOf });
    expect(groups).toHaveLength(1);
    expect(groups[0].rows).toHaveLength(1);
    expect(groups[0].rows[0]).toMatchObject({ fromName: '원격OFD', toName: '단말1' });
    expect(groups[0].rows[0].cableId).toBe('out1');     // seed = passive 끝(단말1) → OPGW(conduit끝) 대신 출력 케이블 관통
  });
});
