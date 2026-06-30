import { describe, it, expect } from 'vitest';
import { projectTrace } from './traceProjection';
import { buildTraceGraph } from './traceGraph';

// flat slim 픽스처 → buildTraceGraph 단일 입력(assets: assetType 중첩 + substationNames 맵).
type Flat = { id: string; name: string; substationId: string; substationName: string; parentAssetId: string | null; role: string | null };
const toAssets = (flat: Flat[]) => flat.map((f) => ({
  id: f.id, name: f.name, substationId: f.substationId, parentAssetId: f.parentAssetId, slotIndex: null,
  assetType: { role: f.role },
}));
const namesOf = (flat: Flat[]) => new Map(flat.map((f) => [f.substationId, f.substationName]));
const buildG = (flat: Flat[], cs: unknown[]) =>
  buildTraceGraph({ assets: toAssets(flat), cables: cs as never[], substationNames: namesOf(flat) });

// U2 입력 계약: graph 는 서버가 반환한 strand-격리 컴포넌트(단일 코어 #5)이다. 과거 픽스처는
// 다른 코어(#6: slotB─OUT#6─eqC)를 섞어 클라 cableTrace 의 채널격리를 흉내냈지만, 이제 그 격리는
// 서버가 하므로 projectTrace 에는 단일 strand 만 들어온다 → 픽스처에서 #6 케이블/노드를 제거.
// eqA─OUT#5─slotA(ofdW) ──OPGW── slotB(ofdH)─OUT#5─eqB
const slim = [
  { id: 'ofdW', name: 'OFD', substationId: 'subW', substationName: '원주S/S', parentAssetId: null, role: 'ofd' },
  { id: 'ofdH', name: 'OFD', substationId: 'subH', substationName: '홍천S/S', parentAssetId: null, role: 'ofd' },
  { id: 'slotA', name: 'OFD', substationId: 'subW', substationName: '원주S/S', parentAssetId: 'ofdW', role: 'slot' },
  { id: 'slotB', name: 'OFD', substationId: 'subH', substationName: '홍천S/S', parentAssetId: 'ofdH', role: 'slot' },
  { id: 'eqA', name: '광단말A', substationId: 'subW', substationName: '원주S/S', parentAssetId: null, role: 'device' },
  { id: 'eqB', name: '광단말B', substationId: 'subH', substationName: '홍천S/S', parentAssetId: null, role: 'device' },
];
const cables = [
  { id: 'opgw', cableType: 'FIBER', sourceAssetId: 'slotA', targetAssetId: 'slotB', sourceRole: 'IN', targetRole: 'IN', number: null },
  { id: 'oA5', cableType: 'FIBER', sourceAssetId: 'slotA', targetAssetId: 'eqA', sourceRole: 'OUT', targetRole: null, number: 5 },
  { id: 'oB5', cableType: 'FIBER', sourceAssetId: 'slotB', targetAssetId: 'eqB', sourceRole: 'OUT', targetRole: null, number: 5 },
];
const graph = buildG(slim, cables);

describe('projectTrace', () => {
  it('시드 OUT#5 → 하이라이트 nodeIds/cableIds 는 접기 전 실제 노드/케이블', () => {
    const p = projectTrace('oA5', graph)!;
    // strand(oA5 #5) = eqA—slotA—(opgw)—slotB—eqB. 정확히 이 네 노드만(형제 코어 누수 없음).
    expect([...p.nodeIds].sort()).toEqual(['eqA', 'eqB', 'slotA', 'slotB']);
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
  it('편도(대국 단말 없음): conduit dead-end 가지치기 → 대국 OFD/슬롯 제외, 빈 토폴로지', () => {
    const slim2 = [
      { id: 'ofdW', name: 'OFD', substationId: 'subW', substationName: '원주S/S', parentAssetId: null, role: 'ofd' },
      { id: 'ofdH', name: 'OFD', substationId: 'subH', substationName: '홍천S/S', parentAssetId: null, role: 'ofd' },
      { id: 'slotA', name: 'OFD', substationId: 'subW', substationName: '원주S/S', parentAssetId: 'ofdW', role: 'slot' },
      { id: 'slotB', name: 'OFD', substationId: 'subH', substationName: '홍천S/S', parentAssetId: 'ofdH', role: 'slot' },
      { id: 'eqA', name: '광단말A', substationId: 'subW', substationName: '원주S/S', parentAssetId: null, role: 'device' },
    ];
    const cables2 = [
      { id: 'opgw', cableType: 'FIBER', sourceAssetId: 'slotA', targetAssetId: 'slotB', sourceRole: 'IN', targetRole: 'IN', number: null },
      { id: 'oA5', cableType: 'FIBER', sourceAssetId: 'slotA', targetAssetId: 'eqA', sourceRole: 'OUT', targetRole: null, number: 5 }, // 대국(slotB) 단말 없음
    ];
    const g2 = buildG(slim2, cables2);
    const p = projectTrace('oA5', g2)!;
    expect(p.nodeIds).not.toContain('slotB');                       // 대국 슬롯 제외
    expect(p.nodes.map((n) => n.nodeId)).not.toContain('ofdH');     // 대국 OFD 노드 제외
    expect(p.nodes).toHaveLength(0);                                // 끊긴 연결 → 빈 토폴로지
  });

  // U2 동치 가드: 서버 strand-격리 컴포넌트 입력에 대해 projectTrace 출력(nodeIds/cableIds/internalTrees)을 고정.
  // devA—patch#5—slot1—OPGW(IN-IN)—slot2—patch#5—devB (양 변전소 각 1코어 strand).
  it('strand-격리 입력: nodeIds/cableIds 는 strand 그대로(설비·슬롯), internalTrees 는 변전소별', () => {
    const slimS = [
      { id: 'ofd1', name: 'OFD', substationId: 'subA', substationName: '인제S/S', parentAssetId: null, role: 'ofd' },
      { id: 'ofd2', name: 'OFD', substationId: 'subB', substationName: '양구S/S', parentAssetId: null, role: 'ofd' },
      { id: 'slot1', name: 'OFD-1', substationId: 'subA', substationName: '인제S/S', parentAssetId: 'ofd1', role: 'slot' },
      { id: 'slot2', name: 'OFD-1', substationId: 'subB', substationName: '양구S/S', parentAssetId: 'ofd2', role: 'slot' },
      { id: 'devA', name: '송변전광단말A', substationId: 'subA', substationName: '인제S/S', parentAssetId: null, role: 'device' },
      { id: 'devB', name: '송변전광단말B', substationId: 'subB', substationName: '양구S/S', parentAssetId: null, role: 'device' },
    ];
    const cablesS = [
      { id: 'patchA', cableType: 'FIBER', sourceAssetId: 'slot1', targetAssetId: 'devA', sourceRole: 'OUT', targetRole: null, number: 5 },
      { id: 'opgw', cableType: 'FIBER', sourceAssetId: 'slot1', targetAssetId: 'slot2', sourceRole: 'IN', targetRole: 'IN', number: null },
      { id: 'patchB', cableType: 'FIBER', sourceAssetId: 'slot2', targetAssetId: 'devB', sourceRole: 'OUT', targetRole: null, number: 5 },
    ];
    const gS = buildG(slimS, cablesS);
    const p = projectTrace('patchA', gS)!;
    // nodeIds: strand 의 모든 설비+슬롯(접기 전). 슬롯은 degree 2 라 가지치기에서 살아남음.
    expect([...p.nodeIds].sort()).toEqual(['devA', 'devB', 'slot1', 'slot2']);
    expect([...p.cableIds].sort()).toEqual(['opgw', 'patchA', 'patchB']);
    // 토폴로지: 슬롯→OFD 접힘 → 설비2 + OFD2.
    expect(p.nodes.map((n) => n.nodeId).sort()).toEqual(['devA', 'devB', 'ofd1', 'ofd2']);
    // OPGW 광edge: OFD↔OFD, 포트=코어#5.
    const fiber = p.edges.find((e) => e.type === 'fiberPath')!;
    expect([fiber.sourceAssetId, fiber.targetAssetId].sort()).toEqual(['ofd1', 'ofd2']);
    expect(fiber.fiberPortNumber).toBe(5);
    // internalTrees: 변전소별 1개(인제·양구).
    expect(p.internalTrees.map((t) => t.substationName).sort()).toEqual(['양구S/S', '인제S/S']);
    expect(p.truncated).toBe(false);
  });
});

// SRC ─IN─ F(distributor) ─OUT─ L1 ; F ─OUT─ L2  (전원 분배 fan-out)
describe('projectTrace tree (통과설비 분배 분기)', () => {
  const slimP = [
    { id: 'SRC', name: '변압기', substationId: 's', substationName: 'S', parentAssetId: null, role: 'device' },
    { id: 'F', name: '피더', substationId: 's', substationName: 'S', parentAssetId: null, role: 'feeder' },
    { id: 'L1', name: '부하1', substationId: 's', substationName: 'S', parentAssetId: null, role: 'device' },
    { id: 'L2', name: '부하2', substationId: 's', substationName: 'S', parentAssetId: null, role: 'device' },
  ];
  const cablesP = [
    { id: 'in', cableType: 'AC', sourceAssetId: 'SRC', targetAssetId: 'F', sourceRole: 'OUT', targetRole: 'IN', number: null },
    { id: 'b1', cableType: 'AC', sourceAssetId: 'F', targetAssetId: 'L1', sourceRole: 'OUT', targetRole: 'IN', number: null },
    { id: 'b2', cableType: 'AC', sourceAssetId: 'F', targetAssetId: 'L2', sourceRole: 'OUT', targetRole: 'IN', number: null },
  ];
  const g = buildG(slimP, cablesP);

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
