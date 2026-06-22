import { describe, it, expect } from 'vitest';
import { buildTraceGraph, traceRemoteEndpoints, remoteSlotSubstation, ofdAssets, equipmentInSubstation } from './traceGraph';

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

const slim = (over: Partial<{ id: string; name: string; substationId: string; substationName: string | null; parentAssetId: string | null; connectionKind: 'distributor'|'conduit'|null; code: string | null }>) => ({
  id: 'x', name: 'x', substationId: 'sub-A', substationName: 'A변전소', parentAssetId: null, connectionKind: null, code: null, ...over,
});

describe('buildTraceGraph staged 메타데이터', () => {
  it('staged-create 자산: substationId 로 subById/subNameById 채움(org 트리 맵으로 해소)', () => {
    const g = buildTraceGraph({
      slimAssets: [slim({ id: 'committed1', substationId: 'sub-A', substationName: 'A변전소' })],
      globalCables: [],
      stagedAssets: [{ id: 'temp1', substationId: 'sub-A', name: '새슬롯', assetType: { connectionKind: 'conduit', code: 'OFD-SLOT' } }],
      stagedCables: [],
      deletes: [],
      substationNames: new Map([['sub-A', 'A변전소']]),
    });
    expect(g.subById.get('temp1')).toBe('sub-A');
    expect(g.subNameById.get('temp1')).toBe('A변전소');
    expect(g.nameById.get('temp1')).toBe('새슬롯');
  });
  it('staged 자산: 변전소명을 substationNames(org 트리 전체 맵)로 해소 — slim 무관', () => {
    const g = buildTraceGraph({
      slimAssets: [], globalCables: [],
      stagedAssets: [{ id: 'temp1', substationId: 'sub-NEW', name: 'x', assetType: { connectionKind: 'conduit' } }],
      stagedCables: [], deletes: [],
      substationNames: new Map([['sub-NEW', '새변전소']]),
    });
    expect(g.subById.get('temp1')).toBe('sub-NEW');
    expect(g.subNameById.get('temp1')).toBe('새변전소');
  });

  it('타 본부→강원 라벨 붕괴 회귀(Bug1): 자국(스테이징)·대국(강원) 변전소명 모두 해소', () => {
    // 자국 slotA = 다른 본부 신규 변전소(staged, slim 없음). 대국 slotB = 강원(committed).
    const g = buildTraceGraph({
      slimAssets: [slim({ id: 'slotB', substationId: 'sub-GW', substationName: '(구)춘천S/S', parentAssetId: 'ofdGW', connectionKind: 'conduit', code: 'OFD-SLOT' })],
      globalCables: [{ id: 'opgw', cableType: 'FIBER', sourceAssetId: 'slotA', targetAssetId: 'slotB', sourceRole: 'IN', targetRole: 'IN', number: null, specParams: { cores: 24 } }],
      stagedAssets: [
        { id: 'ofdA', substationId: 'sub-B', name: 'OFD', assetType: { connectionKind: null, code: 'OFD' } },
        { id: 'slotA', substationId: 'sub-B', name: '(구)춘천S/S', parentAssetId: 'ofdA', assetType: { connectionKind: 'conduit', code: 'OFD-SLOT' } },
      ],
      stagedCables: [],
      deletes: [],
      substationNames: new Map([['sub-B', 'B변전소'], ['sub-GW', '(구)춘천S/S']]),
    });
    // 자국 slotA 의 변전소명이 'B변전소'로 해소돼야(붕괴 시 null → 라벨이 대국명만 남음).
    expect(g.subNameById.get('ofdA')).toBe('B변전소');
    expect(g.subNameById.get('slotA')).toBe('B변전소');
    // 대국은 강원(구춘천).
    expect(remoteSlotSubstation('slotA', g)).toBe('(구)춘천S/S');
  });
  it('커밋 자산(slim) 회귀: slim 의 substationName 사용', () => {
    const g = buildTraceGraph({ slimAssets: [slim({ id: 'c1', substationId: 'sub-A', substationName: 'A변전소' })], globalCables: [], stagedAssets: [], stagedCables: [], deletes: [] });
    expect(g.subNameById.get('c1')).toBe('A변전소');
  });
});

describe('ofdAssets / equipmentInSubstation (Bug2: staged 가 저장 전에도 후보에 보임)', () => {
  it('ofdAssets: 커밋 OFD + 스테이징 OFD 모두 열거', () => {
    const g = buildTraceGraph({
      slimAssets: [slim({ id: 'ofdGW', substationId: 'sub-GW', substationName: '(구)춘천S/S', code: 'OFD', connectionKind: null })],
      globalCables: [],
      stagedAssets: [{ id: 'ofdNEW', substationId: 'sub-B', name: 'OFD', assetType: { connectionKind: null, code: 'OFD' } }],
      stagedCables: [], deletes: [],
      substationNames: new Map([['sub-B', 'B변전소']]),
    });
    const ids = ofdAssets(g).map((o) => o.id).sort();
    expect(ids).toEqual(['ofdGW', 'ofdNEW']);
    const neu = ofdAssets(g).find((o) => o.id === 'ofdNEW')!;
    expect(neu.substationId).toBe('sub-B');
    expect(neu.substationName).toBe('B변전소'); // 저장 전에도 이름 해소
  });

  it('equipmentInSubstation: 스테이징 설비도 후보에 포함, OFD·conduit 제외', () => {
    const g = buildTraceGraph({
      slimAssets: [],
      globalCables: [],
      stagedAssets: [
        { id: 'eqNEW', substationId: 'sub-B', name: '통합단말', assetType: { connectionKind: null, code: 'OPT-COT' } },
        { id: 'ofdB', substationId: 'sub-B', name: 'OFD', assetType: { connectionKind: null, code: 'OFD' } },
        { id: 'slotB', substationId: 'sub-B', name: '슬롯', assetType: { connectionKind: 'conduit', code: 'OFD-SLOT' } },
      ],
      stagedCables: [], deletes: [],
      substationNames: new Map([['sub-B', 'B변전소']]),
    });
    const cand = equipmentInSubstation(g, 'sub-B');
    expect(cand.map((c) => c.id)).toEqual(['eqNEW']); // OFD·conduit 제외, 스테이징 설비만
    expect(cand[0].name).toBe('통합단말');
  });
});
