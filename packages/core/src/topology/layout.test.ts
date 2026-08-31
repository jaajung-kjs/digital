import { describe, expect, it } from 'vitest';
import { NODE_GAP, computeLayout, ringRadius } from './layout.js';
import { detectRings } from './rings.js';
import type { TopoEdge, TopoNode } from './types.js';

const e = (id: string, source: string, target: string): TopoEdge =>
  ({ id, source, target, sourceSlotName: '', targetSlotName: '' });
const n = (id: string): TopoNode => ({ id, name: id, members: [] });

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** 어느 두 마디도 겹치지 않는가 — 겹치면 그림이 거짓말을 한다. */
function noOverlap(pos: Map<string, { x: number; y: number }>) {
  const pts = [...pos.values()];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      expect(dist(pts[i]!, pts[j]!)).toBeGreaterThan(NODE_GAP * 0.5);
    }
  }
}

describe('ringRadius', () => {
  /* 마디 N 개가 서로 NODE_GAP 만큼 떨어지려면 정다각형 한 변이 NODE_GAP 이어야 한다. */
  it('한 변이 NODE_GAP 인 정다각형의 반지름', () => {
    expect(ringRadius(4)).toBeCloseTo(NODE_GAP / (2 * Math.sin(Math.PI / 4)), 6);
    expect(ringRadius(6)).toBeCloseTo(NODE_GAP, 6); // 정육각형은 반지름 = 한 변
  });
});

describe('computeLayout', () => {
  it('링 넷은 원 위에 같은 간격으로 선다', () => {
    const edges = [e('1', 'A', 'B'), e('2', 'B', 'C'), e('3', 'C', 'D'), e('4', 'D', 'A')];
    const nodes = ['A', 'B', 'C', 'D'].map(n);
    const pos = computeLayout(nodes, edges, detectRings(edges));
    const cx = [...pos.values()].reduce((s, p) => s + p.x, 0) / 4;
    const cy = [...pos.values()].reduce((s, p) => s + p.y, 0) / 4;
    const radii = [...pos.values()].map((p) => dist(p, { x: cx, y: cy }));
    for (const r of radii) expect(r).toBeCloseTo(radii[0]!, 6);
    /* 이웃한 두 마디의 거리가 곧 한 변 — NODE_GAP 이다. */
    expect(dist(pos.get('A')!, pos.get('B')!)).toBeCloseTo(NODE_GAP, 6);
    noOverlap(pos);
  });

  it('링이 없으면(사슬) 뿌리에서 방사로 뻗는다', () => {
    const edges = [e('1', 'A', 'B'), e('2', 'B', 'C')];
    const pos = computeLayout(['A', 'B', 'C'].map(n), edges, []);
    expect(pos.size).toBe(3);
    noOverlap(pos);
  });

  it('링에 매달린 가지도 자리를 얻는다', () => {
    const edges = [
      e('1', 'A', 'B'), e('2', 'B', 'C'), e('3', 'C', 'A'),
      e('4', 'C', 'X'), e('5', 'X', 'Y'),
    ];
    const pos = computeLayout(['A', 'B', 'C', 'X', 'Y'].map(n), edges, detectRings(edges));
    expect(pos.size).toBe(5);
    noOverlap(pos);
  });

  it('마디를 공유하는 링 둘 — 다섯 마디가 다 자리를 얻고 겹치지 않는다', () => {
    const edges = [
      e('1', 'A', 'B'), e('2', 'B', 'C'), e('3', 'C', 'A'),
      e('4', 'C', 'D'), e('5', 'D', 'E'), e('6', 'E', 'C'),
    ];
    const pos = computeLayout(['A', 'B', 'C', 'D', 'E'].map(n), edges, detectRings(edges));
    expect(pos.size).toBe(5);
    noOverlap(pos);
  });

  it('구간을 공유하는 링 둘 — 여섯 마디가 한 원 위에 선다(공유 구간은 현이 된다)', () => {
    const edges = [
      e('1', 'A', 'B'), e('2', 'B', 'C'), e('3', 'C', 'D'), e('4', 'D', 'A'),
      e('5', 'A', 'F'), e('6', 'F', 'E'), e('7', 'E', 'D'),
    ];
    const pos = computeLayout(['A', 'B', 'C', 'D', 'E', 'F'].map(n), edges, detectRings(edges));
    const cx = [...pos.values()].reduce((s, p) => s + p.x, 0) / 6;
    const cy = [...pos.values()].reduce((s, p) => s + p.y, 0) / 6;
    const radii = [...pos.values()].map((p) => dist(p, { x: cx, y: cy }));
    for (const r of radii) expect(r).toBeCloseTo(radii[0]!, 6);
    noOverlap(pos);
  });

  it('따로 노는 마디도 자리를 얻는다 — 줄이 하나도 없는 국', () => {
    const pos = computeLayout([n('A')], [], []);
    expect(pos.get('A')).toEqual({ x: 0, y: 0 });
  });

  it('같은 입력이면 같은 좌표 — 그림이 열 때마다 달라지지 않는다', () => {
    const edges = [e('1', 'A', 'B'), e('2', 'B', 'C'), e('3', 'C', 'A'), e('4', 'C', 'X')];
    const nodes = ['A', 'B', 'C', 'X'].map(n);
    const rings = detectRings(edges);
    expect([...computeLayout(nodes, edges, rings)]).toEqual([...computeLayout(nodes, edges, rings)]);
  });
});
