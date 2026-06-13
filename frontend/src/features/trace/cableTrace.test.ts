import { describe, it, expect } from 'vitest';
import { cableTrace } from './cableTrace';

const A = (id: string, k?: 'distributor' | 'conduit') => ({ id, connectionKind: k ?? null });

describe('cableTrace — passive', () => {
  it('일반 자산 체인을 양방향 순회(분기 포함)', () => {
    const assets = [A('L1'), A('X'), A('L2')];
    const cables = [
      { id: 'c1', cableType: 'AC', sourceAssetId: 'L1', targetAssetId: 'X' },
      { id: 'c2', cableType: 'AC', sourceAssetId: 'X', targetAssetId: 'L2' },
    ];
    const r = cableTrace('L1', 'AC', assets, cables);
    expect(new Set(r.nodeIds)).toEqual(new Set(['L1', 'X', 'L2']));
    expect(new Set(r.cableIds)).toEqual(new Set(['c1', 'c2']));
  });
});

describe('cableTrace — distributor', () => {
  it('부하→피더(OUT)→충전기(IN), 형제 OUT 부하로 안 샌다', () => {
    const assets = [A('L'), A('M'), A('F', 'distributor'), A('C')];
    const cables = [
      { id: 'c1', cableType: 'AC', sourceAssetId: 'F', targetAssetId: 'L', sourceRole: 'OUT', targetRole: null },
      { id: 'c2', cableType: 'AC', sourceAssetId: 'F', targetAssetId: 'M', sourceRole: 'OUT', targetRole: null },
      { id: 'c3', cableType: 'AC', sourceAssetId: 'C', targetAssetId: 'F', sourceRole: 'OUT', targetRole: 'IN' },
    ];
    const r = cableTrace('L', 'AC', assets, cables);
    expect(new Set(r.nodeIds)).toEqual(new Set(['L', 'F', 'C']));
    expect(new Set(r.cableIds)).toEqual(new Set(['c1', 'c3']));
  });
});

describe('cableTrace — conduit', () => {
  it('광: 설비→슬롯 OUT#5→OPGW(IN)→대국 슬롯→OUT#5→대국 설비 (번호 짝)', () => {
    const assets = [A('eqA'), A('S1', 'conduit'), A('S2', 'conduit'), A('eqB'), A('eqC')];
    const cables = [
      { id: 'o1', cableType: 'FIBER', sourceAssetId: 'S1', targetAssetId: 'eqA', sourceRole: 'OUT', targetRole: null, number: 5 },
      { id: 'opgw', cableType: 'FIBER', sourceAssetId: 'S1', targetAssetId: 'S2', sourceRole: 'IN', targetRole: 'IN' },
      { id: 'o2', cableType: 'FIBER', sourceAssetId: 'S2', targetAssetId: 'eqB', sourceRole: 'OUT', targetRole: null, number: 5 },
      { id: 'o3', cableType: 'FIBER', sourceAssetId: 'S2', targetAssetId: 'eqC', sourceRole: 'OUT', targetRole: null, number: 6 },
    ];
    const r = cableTrace('eqA', 'FIBER', assets, cables);
    expect(new Set(r.nodeIds)).toEqual(new Set(['eqA', 'S1', 'S2', 'eqB']));
    expect(new Set(r.cableIds)).toEqual(new Set(['o1', 'opgw', 'o2']));
    expect(r.nodeIds).not.toContain('eqC');
  });
});

describe('cableTrace — 엣지케이스', () => {
  it('passive 분기: 허브에서 여러 갈래 모두 포함', () => {
    const assets = [{ id: 'H', connectionKind: null }, { id: 'A', connectionKind: null }, { id: 'B', connectionKind: null }, { id: 'C', connectionKind: null }];
    const cables = [
      { id: 'c1', cableType: 'LAN', sourceAssetId: 'H', targetAssetId: 'A' },
      { id: 'c2', cableType: 'LAN', sourceAssetId: 'H', targetAssetId: 'B' },
      { id: 'c3', cableType: 'LAN', sourceAssetId: 'H', targetAssetId: 'C' },
    ];
    const r = cableTrace('A', 'LAN', assets, cables);
    expect(new Set(r.nodeIds)).toEqual(new Set(['A', 'H', 'B', 'C']));
  });

  it('링(사이클)에서 무한루프 없이 전부 1회 방문', () => {
    const assets = [{ id: 'N1', connectionKind: null }, { id: 'N2', connectionKind: null }, { id: 'N3', connectionKind: null }];
    const cables = [
      { id: 'a', cableType: 'FIBER', sourceAssetId: 'N1', targetAssetId: 'N2' },
      { id: 'b', cableType: 'FIBER', sourceAssetId: 'N2', targetAssetId: 'N3' },
      { id: 'c', cableType: 'FIBER', sourceAssetId: 'N3', targetAssetId: 'N1' },
    ];
    const r = cableTrace('N1', 'FIBER', assets, cables);
    expect(new Set(r.nodeIds)).toEqual(new Set(['N1', 'N2', 'N3']));
    expect(new Set(r.cableIds)).toEqual(new Set(['a', 'b', 'c']));
  });

  it('cableType 다르면 안 탐(전원 추적이 광/네트워크로 안 샘)', () => {
    const assets = [{ id: 'X', connectionKind: null }, { id: 'Y', connectionKind: null }];
    const cables = [
      { id: 'ac', cableType: 'AC', sourceAssetId: 'X', targetAssetId: 'Y' },
      { id: 'lan', cableType: 'LAN', sourceAssetId: 'X', targetAssetId: 'Y' },
    ];
    const r = cableTrace('X', 'AC', assets, cables);
    expect(new Set(r.cableIds)).toEqual(new Set(['ac']));
  });

  it('다단 distributor 상류: 부하→피더→충전기→AC메인', () => {
    const assets = [{ id: 'L', connectionKind: null }, { id: 'F', connectionKind: 'distributor' as const }, { id: 'C', connectionKind: 'distributor' as const }, { id: 'AC', connectionKind: null }];
    const cables = [
      { id: 'c1', cableType: 'DC', sourceAssetId: 'F', targetAssetId: 'L', sourceRole: 'OUT' as const, targetRole: null },
      { id: 'c2', cableType: 'DC', sourceAssetId: 'C', targetAssetId: 'F', sourceRole: 'OUT' as const, targetRole: 'IN' as const },
      { id: 'c3', cableType: 'DC', sourceAssetId: 'AC', targetAssetId: 'C', sourceRole: null, targetRole: 'IN' as const },
    ];
    const r = cableTrace('L', 'DC', assets, cables);
    expect(new Set(r.nodeIds)).toEqual(new Set(['L', 'F', 'C', 'AC']));
  });
});
