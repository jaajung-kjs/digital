import { describe, it, expect } from 'vitest';
import { resolveSelectedCable, resolveSelection, cableToAddress } from './selectionHighlight';
import type { TraceGraph } from '../trace/traceGraph';

const cables = [
  { id: 'in', sourceAssetId: 'src', targetAssetId: 'F', sourceRole: 'OUT', targetRole: 'IN', number: null, cableType: 'POWER' },
  { id: 'b2', sourceAssetId: 'F', targetAssetId: 'L2', sourceRole: 'OUT', targetRole: null, number: 2, cableType: 'POWER' },
  { id: 'o3', sourceAssetId: 'S', targetAssetId: 'e3', sourceRole: 'OUT', targetRole: null, number: 3, cableType: 'FIBER' },
  { id: 'opgw', sourceAssetId: 'S', targetAssetId: 'RS', sourceRole: 'IN', targetRole: 'IN', number: null, cableType: 'FIBER' },
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
  it('core null: 자산에 닿는 대표 케이블', () => {
    expect(resolveSelectedCable('F', null, cables)).toBe('in');
  });
  it('자산 없음/매칭 없음 → null', () => {
    expect(resolveSelectedCable(null, 2, cables)).toBeNull();
    expect(resolveSelectedCable('S', 9, cables)).toBeNull();
  });
});

// 완전한 graph — TraceGraph 의 모든 필드를 채워 cast 가 결손을 숨기지 않게 한다.
// assets 가 비어 role 이 전부 없음(undefined) → projectTrace 의 start 가 passive 로 잡힌다.
const fullGraph = (cs: typeof cables): TraceGraph =>
  ({
    assets: [],
    cables: cs,
    nameById: new Map(),
    subNameById: new Map(),
    subById: new Map(),
    parentById: new Map(),
    codeById: new Map(),
    roleById: new Map(),
    slotIndexById: new Map(),
  } as TraceGraph);
const graphStub = fullGraph(cables);
const effAssets: never[] = [];

describe('resolveSelection (선택 케이블 → projectTrace 회로)', () => {
  it('슬롯 코어 선택 → kind=connection + 그 케이블(o3) 회로', () => {
    const r = resolveSelection('S', 3, null, graphStub, effAssets);
    expect(r.kind).toBe('connection');
    if (r.kind === 'connection') { expect(r.cableId).toBe('o3'); expect([...r.cableIds]).toContain('o3'); }
  });
  it('anchor 케이블 직접 지목 → 그 케이블 projectTrace', () => {
    const r = resolveSelection('OFD', 8, 'o3', graphStub, effAssets);
    expect(r.kind).toBe('connection');
    if (r.kind === 'connection') expect(r.cableId).toBe('o3');
  });
  it('projectTrace 가 시드를 못 찾으면(그래프에 그 케이블 없음) → kind=asset', () => {
    const graphMissingSeed = fullGraph(cables.filter((c) => c.id !== 'o3'));
    const r = resolveSelection('S', 3, 'o3', graphMissingSeed, effAssets);
    expect(r).toEqual({ kind: 'asset', assetId: 'S' });
  });
  it('코어 매칭 케이블 없음 → kind=asset', () => {
    expect(resolveSelection('S', 9, null, graphStub, effAssets)).toEqual({ kind: 'asset', assetId: 'S' });
  });
  it('자산만(core·anchor 없음) → kind=asset (연결 해소 안 함)', () => {
    expect(resolveSelection('F', null, null, graphStub, effAssets)).toEqual({ kind: 'asset', assetId: 'F' });
  });
  it('선택 없음 → kind=none', () => {
    expect(resolveSelection(null, 3, null, graphStub, effAssets)).toEqual({ kind: 'none' });
  });
});

describe('cableToAddress', () => {
  it('보는 자산이 source 끝단 → 그 끝단(role/number)', () => {
    expect(cableToAddress('b2', 'F', graphStub)).toEqual({ assetId: 'F', core: 2 });
  });
  it('보는 자산이 target 끝단 → 그 끝단(IN → FEEDER_INPUT_CORE)', () => {
    expect(cableToAddress('in', 'F', graphStub)).toEqual({ assetId: 'F', core: 0 });
  });
  it('보는 자산 null → source 끝단', () => {
    expect(cableToAddress('b2', null, graphStub)).toEqual({ assetId: 'F', core: 2 });
  });
  it('케이블 없음 → null', () => {
    expect(cableToAddress('zzz', 'F', graphStub)).toBeNull();
  });
});
