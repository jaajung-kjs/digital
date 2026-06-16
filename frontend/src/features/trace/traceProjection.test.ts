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
  it('경로 트리: 광 채널 경로는 선형(분기 없음)', () => {
    let n = projectTrace('oA5', graph)!.tree!;
    let depth = 0;
    while (n.children.length) { expect(n.children).toHaveLength(1); n = n.children[0]; depth++; }
    expect(depth).toBeGreaterThanOrEqual(2); // eqA → ofdW → ofdH → eqB
  });
});

// SRC ─IN─ F(distributor) ─OUT─ L1 ; F ─OUT─ L2  (전원 분배 fan-out)
describe('projectTrace tree (통과설비 분배 분기)', () => {
  const slimP = [
    { id: 'SRC', name: '변압기', substationId: 's', substationName: 'S', parentAssetId: null, connectionKind: null, code: null },
    { id: 'F', name: '피더', substationId: 's', substationName: 'S', parentAssetId: null, connectionKind: 'distributor' as const, code: null },
    { id: 'L1', name: '부하1', substationId: 's', substationName: 'S', parentAssetId: null, connectionKind: null, code: null },
    { id: 'L2', name: '부하2', substationId: 's', substationName: 'S', parentAssetId: null, connectionKind: null, code: null },
  ];
  const cablesP = [
    { id: 'in', cableType: 'AC', sourceAssetId: 'SRC', targetAssetId: 'F', sourceRole: 'OUT', targetRole: 'IN', number: null },
    { id: 'b1', cableType: 'AC', sourceAssetId: 'F', targetAssetId: 'L1', sourceRole: 'OUT', targetRole: 'IN', number: null },
    { id: 'b2', cableType: 'AC', sourceAssetId: 'F', targetAssetId: 'L2', sourceRole: 'OUT', targetRole: 'IN', number: null },
  ];
  const g = buildTraceGraph({ slimAssets: slimP, globalCables: cablesP, stagedAssets: [], stagedCables: [], deletes: [] });

  it('입력 시드 → 변압기 → 피더 → {부하1, 부하2} 분기 트리', () => {
    const t = projectTrace('in', g)!.tree!;
    expect(t.id).toBe('SRC');
    expect(t.isEndpoint).toBe(true);            // 루트 강조
    expect(t.children).toHaveLength(1);
    const f = t.children[0];
    expect(f.id).toBe('F');
    expect(f.children.map((c) => c.id).sort()).toEqual(['L1', 'L2']);  // 분기 2개
    expect(f.children.every((c) => c.isEndpoint && c.children.length === 0)).toBe(true);
  });
});
