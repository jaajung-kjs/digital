import { describe, it, expect } from 'vitest';
import { growRadialForest } from './geometry';

describe('growRadialForest', () => {
  it('한 노드에 매달린 형제 leaf 를 부채꼴 분산 — 정확히 겹치지 않는다(SPQR 인제=신춘천 회귀)', () => {
    // A(0,0) 의 바깥 방향(+x) 으로 형제 leaf 2개. 기존 SPQR 은 둘 다 같은 outDir 에 쌓아 겹쳤다.
    const positions = new Map([['A', { x: 0, y: 0 }]]);
    const center = new Map([['A', { x: -100, y: 0 }]]);
    const adj = new Map<string, Set<string>>([
      ['A', new Set(['L1', 'L2'])],
      ['L1', new Set(['A'])],
      ['L2', new Set(['A'])],
    ]);
    growRadialForest(positions, center, adj, new Set(['L1', 'L2']));
    const p1 = positions.get('L1')!;
    const p2 = positions.get('L2')!;
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();
    expect(Math.hypot(p1.x - p2.x, p1.y - p2.y)).toBeGreaterThan(1); // 분리됨
  });

  it('체인(leaf 의 leaf)도 모두 배치한다', () => {
    const positions = new Map([['A', { x: 0, y: 0 }]]);
    const center = new Map([['A', { x: -100, y: 0 }]]);
    const adj = new Map<string, Set<string>>([
      ['A', new Set(['L1'])],
      ['L1', new Set(['A', 'L2'])],
      ['L2', new Set(['L1'])],
    ]);
    growRadialForest(positions, center, adj, new Set(['L1', 'L2']));
    expect(positions.has('L1')).toBe(true);
    expect(positions.has('L2')).toBe(true);
  });
});
