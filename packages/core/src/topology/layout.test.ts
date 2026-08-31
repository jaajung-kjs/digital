import { describe, expect, it } from 'vitest';
import { NODE_GAP, computeLayout, ringRadius } from './layout.js';
import { detectRings } from './rings.js';
import type { TopoEdge, TopoNode } from './types.js';

const e = (id: string, source: string, target: string): TopoEdge =>
  ({ id, source, target, sourcePortName: '', targetPortName: '' });
const n = (id: string): TopoNode =>
  ({ id, name: id, assemblyName: null, substationName: '', floorName: null, isSeed: false });

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

/** 줄이 제 끝이 아닌 마디를 관통하지 않는가 — 관통하면 상자에 가려 없는 연결처럼 읽힌다.
    화면의 마디 상자는 폭 180·높이 76(NODE_GAP 220 기준)이라, 중심에서 그 반쯤은 비어야 한다. */
function noEdgeThroughNode(
  pos: Map<string, { x: number; y: number }>, edges: TopoEdge[],
) {
  for (const ed of edges) {
    const a = pos.get(ed.source)!;
    const b = pos.get(ed.target)!;
    for (const [id, p] of pos) {
      if (id === ed.source || id === ed.target) continue;
      for (let t = 0; t <= 1; t += 0.01) {
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        const inside = Math.abs(x - p.x) <= NODE_GAP * 0.41 && Math.abs(y - p.y) <= NODE_GAP * 0.18;
        expect(inside, `${ed.source}-${ed.target} 가 ${id} 를 관통한다`).toBe(false);
      }
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

  /* 두 허브 사이에 갈래가 셋인 모양 — 대링이 그중 넷만 덮으면 남은 마디가 가지로 뻗어
     그 줄이 반대편 허브를 관통했다. */
  it('허브 둘 사이 세 갈래에서 줄이 마디를 관통하지 않는다', () => {
    const edges = [
      e('1', 'A', 'B'), e('2', 'B', 'C'),
      e('3', 'C', 'D'), e('4', 'D', 'A'),
      e('5', 'A', 'E'), e('6', 'E', 'C'),
    ];
    const nodes = ['A', 'B', 'C', 'D', 'E'].map(n);
    const pos = computeLayout(nodes, edges, detectRings(edges));
    expect(pos.size).toBe(5);
    noOverlap(pos);
    noEdgeThroughNode(pos, edges);
  });

  it('따로 노는 마디도 자리를 얻는다 — 줄이 하나도 없는 국', () => {
    const pos = computeLayout([n('A')], [], []);
    expect(pos.get('A')).toEqual({ x: 0, y: 0 });
  });

  /* 폭을 고정하면 가지가 다섯만 되어도 형제 사이가 NODE_GAP 아래로 좁아진다 —
     몫은 그대로 두고 부채꼴 전체를 밀어내야 한다. */
  it('한 마디에 가지가 여섯이어도 겹치지 않는다', () => {
    const kids = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6'];
    const edges = kids.map((k, i) => e(`${i}`, 'H', k));
    const pos = computeLayout([n('H'), ...kids.map(n)], edges, []);
    expect(pos.size).toBe(7);
    noOverlap(pos);
  });

  /* 뿌리를 한 번만 고르면 두 번째 덩어리는 이웃 관계가 통째로 버려진다. */
  it('끊어진 덩어리가 둘이면 각각 제 이웃대로 놓인다', () => {
    const edges = [e('1', 'A', 'B'), e('2', 'B', 'C'), e('3', 'D', 'E'), e('4', 'E', 'F')];
    const pos = computeLayout(['A', 'B', 'C', 'D', 'E', 'F'].map(n), edges, []);
    expect(pos.size).toBe(6);
    /* 이어진 두 마디는 NODE_GAP 만큼 떨어져 선다 — 한 줄로 흩뿌려진 것이 아니다. */
    expect(dist(pos.get('D')!, pos.get('E')!)).toBeCloseTo(NODE_GAP, 6);
    expect(dist(pos.get('E')!, pos.get('F')!)).toBeCloseTo(NODE_GAP, 6);
    noOverlap(pos);
  });

  /* 두 국 사이 구간이 두 본이면 이웃 목록에 같은 마디가 두 번 들어간다 — 그러면 형제
     전부의 몫이 틀어져, 무게가 같은 B 와 C 가 대칭으로 서지 않는다. */
  it('평행 구간이 있어도 형제의 부채꼴 몫이 틀어지지 않는다', () => {
    const edges = [e('1', 'A', 'B'), e('2', 'A', 'B'), e('3', 'A', 'C')];
    const pos = computeLayout(['A', 'B', 'C'].map(n), edges, []);
    const b = pos.get('B')!;
    const c = pos.get('C')!;
    expect(b.x).toBeCloseTo(c.x, 6);
    expect(b.y).toBeCloseTo(-c.y, 6);
  });

  it('빈 입력이면 빈 답', () => {
    expect(computeLayout([], [], []).size).toBe(0);
  });

  it('같은 입력이면 같은 좌표 — 그림이 열 때마다 달라지지 않는다', () => {
    const edges = [e('1', 'A', 'B'), e('2', 'B', 'C'), e('3', 'C', 'A'), e('4', 'C', 'X')];
    const nodes = ['A', 'B', 'C', 'X'].map(n);
    const rings = detectRings(edges);
    expect([...computeLayout(nodes, edges, rings)]).toEqual([...computeLayout(nodes, edges, rings)]);
  });
});
