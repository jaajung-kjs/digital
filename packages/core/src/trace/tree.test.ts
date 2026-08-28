import { describe, expect, it } from 'vitest';
import { buildTraceTree, traceChains, traceTreeSize } from './tree.js';
import type { TraceTreeNode } from './tree.js';
import type { TraceHop } from './graph.js';

/**
 * 추적 결과는 **트리로** 읽힌다 — 곧은 길은 곧게, 갈래는 갈래로.
 *
 * 평평한 목록은 갈래를 직렬로 보이게 했고, 「↔ 내부」 줄이 사이사이 끼어 「무엇을 거쳐 어디에
 * 닿았나」를 가렸다. 장비 안의 통과는 마디가 아니다.
 */
const cable = (from: string, to: string, cableId: string): TraceHop => ({ kind: 'cable', fromPortId: from, toPortId: to, cableId });
const inside = (from: string, to: string): TraceHop => ({ kind: 'internal', fromPortId: from, toPortId: to });

describe('buildTraceTree', () => {
  /* UPS 출력 →(케이블) 피더#1 입력 →(내부) 피더#1 출력 →(케이블) 노드 */
  it('장비 안의 통과는 마디가 아니다 — 케이블로 닿은 자리만 선다', () => {
    const tree = buildTraceTree([cable('ups-out', 'f1-in', 'c1'), inside('f1-in', 'f1-out'), cable('f1-out', 'node1-in', 'c2')], 'ups-out');
    expect(tree.portId).toBe('ups-out');
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0]).toMatchObject({ portId: 'f1-in', cableId: 'c1' });
    /* 노드는 **피더 밑**에 붙는다 — 피더를 거쳐 간 것이니까(형제가 아니다). */
    expect(tree.children[0]!.children).toHaveLength(1);
    expect(tree.children[0]!.children[0]).toMatchObject({ portId: 'node1-in', cableId: 'c2' });
    expect(traceTreeSize(tree)).toBe(2);
  });

  it('한 장비에서 열 갈래가 나가면 열 형제가 된다 — 직렬로 줄 세우지 않는다', () => {
    const hops: TraceHop[] = [cable('ups-out', 'f1-in', 'c0')];
    for (let i = 1; i <= 10; i++) {
      hops.push(inside('f1-in', `f1-out${i}`));
      hops.push(cable(`f1-out${i}`, `node${i}`, `c${i}`));
    }
    const tree = buildTraceTree(hops, 'ups-out');
    const feeder = tree.children[0]!;
    expect(feeder.children.map((c) => c.portId)).toEqual(
      Array.from({ length: 10 }, (_, i) => `node${i + 1}`),
    );
    /* 손자까지 세면 11 — 피더 하나와 노드 열. */
    expect(traceTreeSize(tree)).toBe(11);
  });

  /* 반대로 부하에서 거슬러 오르면 길이 하나다 — 갈래가 없으니 곧게 선다. */
  it('곧은 길은 곧게 — 마디마다 자식 하나', () => {
    const tree = buildTraceTree(
      [cable('node1', 'f1-out1', 'c1'), inside('f1-out1', 'f1-in'), cable('f1-in', 'ups-out', 'c0')],
      'node1',
    );
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0]!.portId).toBe('f1-out1');
    expect(tree.children[0]!.children).toHaveLength(1);
    expect(tree.children[0]!.children[0]!.portId).toBe('ups-out');
  });

  it('닿은 곳이 없으면 뿌리만 남는다', () => {
    expect(buildTraceTree([], 'lonely')).toEqual({ portId: 'lonely', children: [] });
    expect(traceTreeSize(buildTraceTree([], 'lonely'))).toBe(0);
  });

  /* 내부 통과가 두 번 이어져도(포트를 두 번 갈아타도) 접힌다. */
  it('내부 통과가 이어져도 그 너머를 제자리로 끌어올린다', () => {
    const tree = buildTraceTree(
      [inside('a-in', 'a-mid'), inside('a-mid', 'a-out'), cable('a-out', 'b-in', 'c1')],
      'a-in',
    );
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0]!.portId).toBe('b-in');
  });
});

/**
 * **거슬러 오르는 길은 흐르는 차례로 읽는다** — 출처가 위, 내가 아래.
 *
 * 트리는 「내가 시작해서 어디로 뻗나」를 말한다. 그런데 전원이 어디서 오는지 물었을 때의
 * 답은 반대 방향으로 읽힌다: 소내전원반 → 충전기 → DC 48V → 나. 길을 뽑아 뒤집으면 된다.
 */
describe('traceChains', () => {
  const leaf = (portId: string): TraceTreeNode => ({ portId, children: [] });

  it('곧은 길은 하나 — 뿌리부터 잎까지', () => {
    const root: TraceTreeNode = { portId: 'me', children: [{ portId: 'a', children: [leaf('b')] }] };
    expect(traceChains(root).map((path) => path.map((n) => n.portId))).toEqual([['me', 'a', 'b']]);
  });

  /* 이중 인입이면 길이 둘이다 — 「이 두 길로 전원이 온다」가 맞는 답이다. */
  it('갈래가 있으면 길이 여럿이다', () => {
    const root: TraceTreeNode = { portId: 'me', children: [leaf('a'), { portId: 'b', children: [leaf('c')] }] };
    expect(traceChains(root).map((path) => path.map((n) => n.portId))).toEqual([['me', 'a'], ['me', 'b', 'c']]);
  });

  it('혼자면 그 자신이 한 길이다', () => {
    expect(traceChains(leaf('me')).map((path) => path.map((n) => n.portId))).toEqual([['me']]);
  });
});
