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
