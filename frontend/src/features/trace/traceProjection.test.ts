import { describe, it, expect } from 'vitest';
import { projectTrace } from './traceProjection';
import { buildTraceGraph } from './traceGraph';

// eqA─OUT#5─slotA(ofdW) ──OPGW── slotB(ofdH)─OUT#5─eqB ; slotB─OUT#6─eqC
const slim = [
  { id: 'ofdW', name: 'OFD', substationId: 'subW', substationName: '원주S/S', parentAssetId: null, connectionKind: null, code: 'OFD' },
  { id: 'ofdH', name: 'OFD', substationId: 'subH', substationName: '홍천S/S', parentAssetId: null, connectionKind: null, code: 'OFD' },
  { id: 'slotA', name: 'OFD', substationId: 'subW', substationName: '원주S/S', parentAssetId: 'ofdW', connectionKind: 'conduit' as const, code: 'OFD-SLOT' },
  { id: 'slotB', name: 'OFD', substationId: 'subH', substationName: '홍천S/S', parentAssetId: 'ofdH', connectionKind: 'conduit' as const, code: 'OFD-SLOT' },
  { id: 'eqA', name: '광단말A', substationId: 'subW', substationName: '원주S/S', parentAssetId: null, connectionKind: null, code: 'OPT-TRANS' },
  { id: 'eqB', name: '광단말B', substationId: 'subH', substationName: '홍천S/S', parentAssetId: null, connectionKind: null, code: 'OPT-TRANS' },
  { id: 'eqC', name: '광단말C', substationId: 'subH', substationName: '홍천S/S', parentAssetId: null, connectionKind: null, code: 'OPT-TRANS' },
];
const cables = [
  { id: 'opgw', cableType: 'FIBER', sourceAssetId: 'slotA', targetAssetId: 'slotB', sourceRole: 'IN', targetRole: 'IN', number: null },
  { id: 'oA5', cableType: 'FIBER', sourceAssetId: 'slotA', targetAssetId: 'eqA', sourceRole: 'OUT', targetRole: null, number: 5 },
  { id: 'oB5', cableType: 'FIBER', sourceAssetId: 'slotB', targetAssetId: 'eqB', sourceRole: 'OUT', targetRole: null, number: 5 },
  { id: 'oB6', cableType: 'FIBER', sourceAssetId: 'slotB', targetAssetId: 'eqC', sourceRole: 'OUT', targetRole: null, number: 6 },
];
const graph = buildTraceGraph({ slimAssets: slim, globalCables: cables, stagedAssets: [], stagedCables: [], deletes: [] });

describe('projectTrace', () => {
  it('시드 OUT#5 → 하이라이트 nodeIds/cableIds 는 접기 전 실제 노드/케이블', () => {
    const p = projectTrace('oA5', graph)!;
    expect(p.nodeIds).toContain('eqA');
    expect(p.nodeIds).toContain('eqB');
    expect(p.nodeIds).not.toContain('eqC');
    expect(p.cableIds).toContain('opgw');
  });
  it('토폴로지: 슬롯→OFD 접힘, OPGW→광edge(OFD↔OFD #5)', () => {
    const p = projectTrace('oA5', graph)!;
    expect(p.nodes.map((n) => n.nodeId).sort()).toEqual(['eqA', 'eqB', 'ofdH', 'ofdW']);
    const fiber = p.edges.find((e) => e.type === 'fiberPath')!;
    expect([fiber.sourceAssetId, fiber.targetAssetId].sort()).toEqual(['ofdH', 'ofdW']);
    expect(fiber.fiberPortNumber).toBe(5);
    const ofdNode = p.nodes.find((n) => n.nodeId === 'ofdW')!;
    expect(ofdNode.materialCategoryCode).toBe('EQP-OFD');
  });
  it('경로상세 steps: 양끝 설비 + 광 hop', () => {
    const p = projectTrace('oA5', graph)!;
    const labels = p.steps.map((s) => s.label);
    expect(labels).toContain('광단말A');
    expect(labels.some((l) => l.includes('홍천S/S') || l === '광단말B')).toBe(true);
    expect(p.steps[0].isEndpoint).toBe(true);
  });
});
