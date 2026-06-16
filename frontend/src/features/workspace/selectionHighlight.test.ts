import { describe, it, expect } from 'vitest';
import { resolveSelectedCable, resolveHighlight } from './selectionHighlight';
import type { DiagramComponent } from '../connections/connectionDiagram';

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

describe('resolveHighlight', () => {
  it('슬롯 코어 선택 → 그 케이블이 속한 컴포넌트를 그대로 하이라이트(diagram)', () => {
    expect(resolveHighlight('S', 3, cables, components)).toEqual({ kind: 'diagram', comp: slotComp });
  });
  it('피더 CB 선택(core=2) → 분기 케이블이 속한 분배 컴포넌트(diagram)', () => {
    expect(resolveHighlight('F', 2, cables, components)).toEqual({ kind: 'diagram', comp: feederComp });
  });
  it('피더 입력(core 0) → IN 케이블이 속한 분배 컴포넌트(diagram)', () => {
    expect(resolveHighlight('F', 0, cables, components)).toEqual({ kind: 'diagram', comp: feederComp });
  });
  it('피더 자산만(core null) → 대표 케이블의 분배 컴포넌트(diagram)', () => {
    expect(resolveHighlight('F', null, cables, components)).toEqual({ kind: 'diagram', comp: feederComp });
  });
  it('케이블이 어느 컴포넌트에도 없지만 core===comp.core 매칭 → diagram', () => {
    expect(resolveHighlight('S', 3, [], components)).toEqual({ kind: 'diagram', comp: slotComp });
  });
  it('케이블은 있으나 컴포넌트 없음 → trace 폴백', () => {
    expect(resolveHighlight('S', 3, cables, [])).toEqual({ kind: 'trace', cableId: 'o3' });
  });
  it('자산 없음 → clear', () => {
    expect(resolveHighlight(null, 3, cables, components)).toEqual({ kind: 'clear' });
  });
  it('케이블도 컴포넌트도 없음 → clear', () => {
    expect(resolveHighlight('S', 9, [], [])).toEqual({ kind: 'clear' });
  });
});
