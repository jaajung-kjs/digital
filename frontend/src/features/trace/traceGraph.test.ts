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
  { id: 'opgw', cableType: 'FIBER', sourceAssetId: 'slotA', targetAssetId: 'slotB', sourceRole: 'IN', targetRole: 'IN', number: null, specParams: { cores: 24 }, categoryName: 'HIV 2.5sq', categoryId: 'cat1' },
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
    expect(g.parentById.get('slotA')).toBe('ofdW');
    expect(g.codeById.get('slotA')).toBe('OFD-SLOT');
    expect(g.parentById.get('eqA')).toBe(null);
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

  it('toTraceCable 이 specParams 를 보존한다 (graph.cables 에서 OPGW cores 읽힘 — 프로덕션 회귀 가드)', () => {
    // 실제 경로: 입력 cable → toTraceCable → graph.cables. specParams 가 strip 되면 이 단언이 깨진다.
    const g = buildTraceGraph({ slimAssets, globalCables, stagedAssets: [], stagedCables: [], deletes: [] });
    const opgw = g.cables.find((c) => c.id === 'opgw');
    expect(opgw?.specParams).toEqual({ cores: 24 });
    expect((opgw?.specParams as { cores?: number } | undefined)?.cores).toBe(24);
  });

  it('toTraceCable 가 categoryName/categoryId 를 보존한다 (계통 규격)', () => {
    // 기존 specParams 회귀 테스트와 같은 buildTraceGraph 경로로, 입력 케이블에 category 를 실어
    // graph.cables 에 보존되는지 확인. (보존 안 하면 계통 규격 컬럼이 빈다.)
    const g = buildTraceGraph({ slimAssets, globalCables, stagedAssets: [], stagedCables: [], deletes: [] });
    expect(g.cables.find((c) => c.id === 'opgw')).toMatchObject({ categoryName: 'HIV 2.5sq', categoryId: 'cat1' });
  });

  it('deletes 에 든 asset id 는 그래프에서 빠진다 (스테이징 삭제 반영)', () => {
    const g = buildTraceGraph({ slimAssets, globalCables, stagedAssets: [], stagedCables: [], deletes: ['eqB'] });
    expect(g.assets.some((a) => a.id === 'eqB')).toBe(false);
    expect(traceRemoteEndpoints('eqA', g)).not.toContain('eqB'); // 삭제된 대국설비는 투영 안됨
  });

  it('subById: 자산 → substationId 매핑을 노출한다', () => {
    const g = buildTraceGraph({
      slimAssets: [
        { id: 'x', name: 'X', substationId: 'subA', substationName: 'A', parentAssetId: null, connectionKind: null, code: null },
      ],
      globalCables: [], stagedAssets: [], stagedCables: [], deletes: [],
    });
    expect(g.subById.get('x')).toBe('subA');
  });
});
