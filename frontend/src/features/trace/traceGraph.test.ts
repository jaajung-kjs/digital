import { describe, it, expect } from 'vitest';
import { buildTraceGraph, traceRemoteEndpoints, remoteSlotSubstation } from './traceGraph';

// 원주 slotA ──OPGW── 홍천 slotB. eqA─OUT#5─slotA ; eqB─OUT#5─slotB ; eqC─OUT#6─slotB
const slimAssets = [
  { id: 'slotA', name: 'OFD', substationId: 'subW', substationName: '원주S/S', parentAssetId: 'ofdW', connectionKind: 'conduit' as const, code: 'OFD-SLOT' },
  { id: 'slotB', name: 'OFD', substationId: 'subH', substationName: '홍천S/S', parentAssetId: 'ofdH', connectionKind: 'conduit' as const, code: 'OFD-SLOT' },
  { id: 'eqA', name: '광단말A', substationId: 'subW', substationName: '원주S/S', parentAssetId: null, connectionKind: null, code: 'OPT-TRANS' },
  { id: 'eqB', name: '광단말B', substationId: 'subH', substationName: '홍천S/S', parentAssetId: null, connectionKind: null, code: 'OPT-TRANS' },
  { id: 'eqC', name: '광단말C', substationId: 'subH', substationName: '홍천S/S', parentAssetId: null, connectionKind: null, code: 'OPT-TRANS' },
];
const globalCables = [
  { id: 'opgw', cableType: 'FIBER', sourceAssetId: 'slotA', targetAssetId: 'slotB', sourceRole: 'IN', targetRole: 'IN', number: null },
  { id: 'oA5', cableType: 'FIBER', sourceAssetId: 'slotA', targetAssetId: 'eqA', sourceRole: 'OUT', targetRole: null, number: 5 },
  { id: 'oB5', cableType: 'FIBER', sourceAssetId: 'slotB', targetAssetId: 'eqB', sourceRole: 'OUT', targetRole: null, number: 5 },
  { id: 'oB6', cableType: 'FIBER', sourceAssetId: 'slotB', targetAssetId: 'eqC', sourceRole: 'OUT', targetRole: null, number: 6 },
];

describe('buildTraceGraph + projections', () => {
  it('global 만으로 그래프를 만들고 같은 번호 대국 설비를 투영한다', () => {
    const g = buildTraceGraph({ slimAssets, globalCables, stagedAssets: [], stagedCables: [], deletes: [] });
    expect(g.assets.find((a) => a.id === 'slotA')?.connectionKind).toBe('conduit');
    expect(g.cables.find((c) => c.id === 'oA5')?.number).toBe(5);
    const remote = traceRemoteEndpoints('eqA', g);
    expect(remote).toContain('eqB');
    expect(remote).not.toContain('eqC');
    expect(remote).not.toContain('eqA');
    expect(remote).not.toContain('slotA');
    expect(remoteSlotSubstation('slotA', g)).toBe('홍천S/S');
  });

  it('이 변전소 staged cable 이 global 위에 오버레이된다 (deletes 제거 + 임시 id 추가)', () => {
    const g = buildTraceGraph({
      slimAssets,
      globalCables,
      stagedAssets: [],
      stagedCables: [{ id: 'tmp-new', cableType: 'FIBER', sourceAssetId: 'slotA', targetAssetId: 'eqA', sourceRole: 'OUT', targetRole: null, number: 7 }],
      deletes: ['oA5'],
    });
    expect(g.cables.some((c) => c.id === 'oA5')).toBe(false);
    expect(g.cables.some((c) => c.id === 'tmp-new')).toBe(true);
  });
});
