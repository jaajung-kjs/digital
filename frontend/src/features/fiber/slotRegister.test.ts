import { describe, it, expect } from 'vitest';
import { buildSlotCoreRows } from './slotRegister';
import { buildTraceGraph } from '../trace/traceGraph';

const slot = { id: 'slotA', name: 'OFD', parentAssetId: 'ofdW' };
const localCables = [
  { id: 'opgw', cableType: 'FIBER', sourceAssetId: 'slotA', targetAssetId: 'slotB', sourceRole: 'IN', targetRole: 'IN', number: null, specParams: { cores: 4 } },
  { id: 'oA3', cableType: 'FIBER', sourceAssetId: 'slotA', targetAssetId: 'eqA', sourceRole: 'OUT', targetRole: null, number: 3, specParams: { purpose: '보호', __migration: 'x' } },
];
const slim = [
  { id: 'slotA', name: 'OFD', substationId: 'subW', substationName: '원주S/S', parentAssetId: 'ofdW', connectionKind: 'conduit' as const, code: 'OFD-SLOT' },
  { id: 'slotB', name: 'OFD', substationId: 'subH', substationName: '홍천S/S', parentAssetId: 'ofdH', connectionKind: 'conduit' as const, code: 'OFD-SLOT' },
  { id: 'eqA', name: '광단말A', substationId: 'subW', substationName: '원주S/S', parentAssetId: null, connectionKind: null, code: 'X' },
  { id: 'eqB', name: '광단말B', substationId: 'subH', substationName: '홍천S/S', parentAssetId: null, connectionKind: null, code: 'X' },
];
const globalCables = [
  ...localCables.map((c) => ({ ...c })),
  { id: 'oB3', cableType: 'FIBER', sourceAssetId: 'slotB', targetAssetId: 'eqB', sourceRole: 'OUT', targetRole: null, number: 3, specParams: {} },
];

describe('buildSlotCoreRows', () => {
  it('점유 행(메타·근접) + 용량까지 빈 행 + far 투영, 코어 번호 1..N 연속', () => {
    const graph = buildTraceGraph({ slimAssets: slim, globalCables, stagedAssets: [], stagedCables: [], deletes: [] });
    const rows = buildSlotCoreRows(slot, localCables, graph);
    expect(rows.map((r) => r.coreNumber)).toEqual([1, 2, 3, 4]); // 연속
    const r3 = rows.find((r) => r.coreNumber === 3)!;
    expect(r3.occupied).toBe(true);
    expect(r3.cableId).toBe('oA3');
    expect(r3.nearAssetId).toBe('eqA');
    expect(r3.purpose).toBe('보호');
    expect(r3.farName).toBe('광단말B');
    const r1 = rows.find((r) => r.coreNumber === 1)!;
    expect(r1.occupied).toBe(false);
    expect(r1.cableId).toBe(null);
  });

  it('graph 없으면 far 는 null, 점유 행은 그대로', () => {
    const rows = buildSlotCoreRows(slot, localCables, null);
    expect(rows.find((r) => r.coreNumber === 3)!.farName).toBe(null);
  });

  it('점유 코어가 cores 를 초과하면 용량이 확장되고 1..max 연속(가려지지 않음)', () => {
    const lc = [
      { id: 'opgw', cableType: 'FIBER', sourceAssetId: 'slotA', targetAssetId: 'slotB', sourceRole: 'IN', targetRole: 'IN', number: null, specParams: { cores: 4 } },
      { id: 'oA6', cableType: 'FIBER', sourceAssetId: 'slotA', targetAssetId: 'eqA', sourceRole: 'OUT', targetRole: null, number: 6, specParams: {} },
    ];
    const rows = buildSlotCoreRows(slot, lc, null);
    expect(rows.map((r) => r.coreNumber)).toEqual([1, 2, 3, 4, 5, 6]); // max(4,6)=6, 연속
    expect(rows.find((r) => r.coreNumber === 6)!.occupied).toBe(true);
    expect(rows.find((r) => r.coreNumber === 4)!.occupied).toBe(false);
  });
});
