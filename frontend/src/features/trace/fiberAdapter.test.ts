import { describe, it, expect } from 'vitest';
import { fiberToUnifiedGraph } from './fiberAdapter';
import { cableTrace } from './cableTrace';

const fiberPaths = [{ id: 'fp1', ofdAId: 'ofdWonju', ofdBId: 'ofdHongcheon', portCount: 24 }];
const fiberCables = [
  { id: 'c1', cableType: 'FIBER', sourceAssetId: 'eqA', targetAssetId: 'ofdWonju', fiberPathId: 'fp1', fiberPortNumber: 5 },
  { id: 'c2', cableType: 'FIBER', sourceAssetId: 'eqB', targetAssetId: 'ofdHongcheon', fiberPathId: 'fp1', fiberPortNumber: 5 },
  { id: 'c3', cableType: 'FIBER', sourceAssetId: 'eqC', targetAssetId: 'ofdHongcheon', fiberPathId: 'fp1', fiberPortNumber: 6 },
];

describe('fiberToUnifiedGraph + cableTrace', () => {
  it('어댑터 그래프에 cableTrace 돌리면 eqA→OPGW→eqB 광경로(번호5)만 나온다', () => {
    const g = fiberToUnifiedGraph(fiberPaths, fiberCables, []);
    expect(g.assets.some((a) => a.connectionKind === 'conduit')).toBe(true);
    expect(g.cables.filter((c) => c.sourceRole === 'IN' && c.targetRole === 'IN').length).toBe(1);
    const r = cableTrace('eqA', 'FIBER', g.assets, g.cables);
    expect(r.nodeIds).toContain('eqB');
    expect(r.nodeIds).not.toContain('eqC');
  });

  it('슬롯 가상자산 id 는 결정적(ofdslot:fpId:A/B)', () => {
    const g = fiberToUnifiedGraph(fiberPaths, fiberCables, []);
    expect(g.assets.map((a) => a.id)).toEqual(expect.arrayContaining(['ofdslot:fp1:A', 'ofdslot:fp1:B']));
  });
});
