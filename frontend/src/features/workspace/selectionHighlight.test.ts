import { describe, it, expect } from 'vitest';
import { resolveSelectedCable, resolveHighlight, resolveSelection, cableToAddress } from './selectionHighlight';
import type { DiagramComponent } from '../connections/connectionDiagram';
import type { TraceGraph } from '../trace/traceGraph';

const cables = [
  { id: 'in', sourceAssetId: 'src', targetAssetId: 'F', sourceRole: 'OUT', targetRole: 'IN', number: null },
  { id: 'b2', sourceAssetId: 'F', targetAssetId: 'L2', sourceRole: 'OUT', targetRole: null, number: 2 },
  { id: 'o3', sourceAssetId: 'S', targetAssetId: 'e3', sourceRole: 'OUT', targetRole: null, number: 3 },
  { id: 'opgw', sourceAssetId: 'S', targetAssetId: 'RS', sourceRole: 'IN', targetRole: 'IN', number: null },
];

describe('resolveSelectedCable', () => {
  it('슬롯 OUT 코어: number===core 케이블', () => {
    expect(resolveSelectedCable('S', 3, cables)).toBe('o3');
  });
  it('피더 분기: number===core(CB)', () => {
    expect(resolveSelectedCable('F', 2, cables)).toBe('b2');
  });
  it('피더 입력(core 0): 그 자산의 IN 케이블', () => {
    expect(resolveSelectedCable('F', 0, cables)).toBe('in');
  });
  it('core null: 자산에 닿는 대표 케이블(전체 연결 하이라이트)', () => {
    expect(resolveSelectedCable('F', null, cables)).toBe('in');
  });
  it('자산 없음/매칭 없음 → null', () => {
    expect(resolveSelectedCable(null, 2, cables)).toBeNull();
    expect(resolveSelectedCable('S', 9, cables)).toBeNull();
  });
});

const comp = (id: string, cableIds: string[], core: number | null): DiagramComponent =>
  ({ seedCableId: cableIds[0], cableIds, core, nodeIds: [], root: { id, label: id, kind: 'asset', isSelf: false, isOrigin: false, edgeFiber: false, children: [] } });

// 슬롯 회로(코어3=o3), 피더 분배(입력 in + 분기 b2, core=null — 다분기)
const slotComp = comp('slot3', ['o3'], 3);
const feederComp = comp('dist', ['in', 'b2'], null);
const components = [slotComp, feederComp];

// core 만으로는 구분 안 되는 core-null 컴포넌트 둘 (번호 없는 네트워크 등)
const netA = comp('netA', ['na'], null);
const netB = comp('netB', ['nb'], null);

describe('resolveHighlight', () => {
  it('슬롯 코어 선택 → 그 케이블이 속한 컴포넌트를 그대로 하이라이트(diagram)', () => {
    expect(resolveHighlight('S', 3, null, cables, components)).toEqual({ kind: 'diagram', comp: slotComp });
  });
  it('피더 CB 선택(core=2) → 분기 케이블이 속한 분배 컴포넌트(diagram)', () => {
    expect(resolveHighlight('F', 2, null, cables, components)).toEqual({ kind: 'diagram', comp: feederComp });
  });
  it('피더 입력(core 0) → IN 케이블이 속한 분배 컴포넌트(diagram)', () => {
    expect(resolveHighlight('F', 0, null, cables, components)).toEqual({ kind: 'diagram', comp: feederComp });
  });
  it('피더 자산만(core null) → 대표 케이블의 분배 컴포넌트(diagram)', () => {
    expect(resolveHighlight('F', null, null, cables, components)).toEqual({ kind: 'diagram', comp: feederComp });
  });
  it('정확 지목(anchor) → 시드 케이블로 컴포넌트 확정(core 무관)', () => {
    // core 둘 다 null 이라 코어로는 구분 불가 — anchor(시드 케이블)가 유일하게 지목.
    expect(resolveHighlight('N', null, 'na', [], [netA, netB])).toEqual({ kind: 'diagram', comp: netA });
    expect(resolveHighlight('N', null, 'nb', [], [netA, netB])).toEqual({ kind: 'diagram', comp: netB });
  });
  it('anchor 가 시드는 아니지만 소속 케이블이면 그 컴포넌트', () => {
    expect(resolveHighlight('F', null, 'b2', [], components)).toEqual({ kind: 'diagram', comp: feederComp });
  });
  it('케이블이 어느 컴포넌트에도 없지만 core===comp.core 매칭 → diagram', () => {
    expect(resolveHighlight('S', 3, null, [], components)).toEqual({ kind: 'diagram', comp: slotComp });
  });
  it('케이블은 있으나 컴포넌트 없음 → trace 폴백', () => {
    expect(resolveHighlight('S', 3, null, cables, [])).toEqual({ kind: 'trace', cableId: 'o3' });
  });
  it('자산 없음 → clear', () => {
    expect(resolveHighlight(null, 3, null, cables, components)).toEqual({ kind: 'clear' });
  });
  it('케이블도 컴포넌트도 없음 → clear', () => {
    expect(resolveHighlight('S', 9, null, [], [])).toEqual({ kind: 'clear' });
  });
});

// 완전한 graph — TraceGraph 의 모든 필드를 채워 cast 가 결손을 숨기지 않게 한다.
// assets 가 비어 connectionKind 가 전부 null → projectTrace 의 start 가 source 로 잡힌다.
const fullGraph = (cs: typeof cables): TraceGraph =>
  ({
    assets: [],
    cables: cs,
    nameById: new Map(),
    subNameById: new Map(),
    subById: new Map(),
    parentById: new Map(),
    codeById: new Map(),
  } as unknown as TraceGraph);
const graphStub = fullGraph(cables);
const effAssets: never[] = [];

describe('resolveSelection', () => {
  it('연결(diagram): 슬롯 코어 → kind=connection + 그 컴포넌트의 cableIds', () => {
    const r = resolveSelection('S', 3, null, graphStub, components, effAssets);
    expect(r.kind).toBe('connection');
    if (r.kind === 'connection') expect([...r.cableIds]).toContain('o3');
  });
  it('trace 폴백(컴포넌트 없음): 케이블→projectTrace→kind=connection + 시드 cableId', () => {
    // components:[] → resolveHighlight 는 {kind:'trace', cableId:'o3'} 반환.
    const r = resolveSelection('S', 3, null, graphStub, [], effAssets);
    expect(r.kind).toBe('connection');
    // seedCableId 는 projectTrace 시드(o3). cableIds 집합 내용은 projectTrace 내부
    // 가지치기(pruneDanglingConduits)에 달려 있어 단언하지 않는다 — 분기 발화만 검증.
    if (r.kind === 'connection') expect(r.cableId).toBe('o3');
  });
  it('trace 폴백에서 projectTrace 가 시드를 못 찾으면 → kind=asset', () => {
    // graph.cables 에 'o3' 가 없어 projectTrace 가 null → asset 폴백.
    // resolveHighlight 는 cableId 인자 cables 로 'o3' 를 해소하지만 graph 엔 없음.
    const graphMissingSeed = fullGraph(cables.filter((c) => c.id !== 'o3'));
    const r = resolveSelection('S', 3, 'o3', graphMissingSeed, [], effAssets);
    expect(r).toEqual({ kind: 'asset', assetId: 'S' });
  });
  it('자산만(매칭 없음) → kind=asset', () => {
    const r = resolveSelection('S', 9, null, graphStub, [], effAssets);
    expect(r).toEqual({ kind: 'asset', assetId: 'S' });
  });
  it('선택 없음 → kind=none', () => {
    expect(resolveSelection(null, 3, null, graphStub, components, effAssets)).toEqual({ kind: 'none' });
  });
});

describe('cableToAddress', () => {
  it('보는 자산이 source 끝단 → 그 끝단(role/number)', () => {
    expect(cableToAddress('b2', 'F', graphStub)).toEqual({ assetId: 'F', core: 2 });
  });
  it('보는 자산이 target 끝단 → 그 끝단(IN → FEEDER_INPUT_CORE)', () => {
    // 'in' = {source:'src' OUT, target:'F' IN} — F 가 target IN 끝단.
    expect(cableToAddress('in', 'F', graphStub)).toEqual({ assetId: 'F', core: 0 });
  });
  it('보는 자산 null → source 끝단', () => {
    expect(cableToAddress('b2', null, graphStub)).toEqual({ assetId: 'F', core: 2 });
  });
  it('케이블 없음 → null', () => {
    expect(cableToAddress('zzz', 'F', graphStub)).toBeNull();
  });
});
