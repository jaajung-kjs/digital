import { describe, expect, it } from 'vitest';
import { buildTraceTree, traceChains, traceIndentRows, traceLanes, traceTreeSize } from './tree.js';
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
  /**
   * **다심(OPGW) 포트는 마디가 아니다** — 케이블로 닿지만 거기 서 있는 것이 없다.
   *
   * 마디로 세웠더니 두 가지가 어긋났다. 24심이 포트 하나라 이름이 `슬롯#1` 로 겹쳤고,
   * 대국이 아직 성단되지 않은 코어는 **아무 데도 닿지 않았는데** 슬롯 이름이 대국인 것처럼
   * 남았다. 접으면 이어진 코어만 그 장비가 마디로 서고, 안 이어진 코어는 마디가 없다.
   */
  it('다심 포트는 마디가 아니다 — 그 너머의 장비가 선다', () => {
    const intoTrunk = (from: string, to: string, cableId: string, core: number): TraceHop =>
      ({ kind: 'cable', fromPortId: from, toPortId: to, cableId, core });
    /* 앞면#1 →(내부, 코어1) 자국 OPGW →(구간 케이블) 대국 OPGW →(내부) 대국 앞면#1 →(점퍼) 장비 */
    const tree = buildTraceTree([
      cable('devA', 'slot1-front1', 'jumper-a'),
      { kind: 'internal', fromPortId: 'slot1-front1', toPortId: 'slot1-opgw', core: 1 },
      intoTrunk('slot1-opgw', 'slot2-opgw', 'opgw', 1),
      { kind: 'internal', fromPortId: 'slot2-opgw', toPortId: 'slot2-front1' },
      cable('slot2-front1', 'devB', 'jumper-b'),
    ], 'devA');
    expect(tree).toEqual({
      portId: 'devA',
      children: [{
        portId: 'slot1-front1', cableId: 'jumper-a',
        children: [{ portId: 'devB', cableId: 'jumper-b', children: [] }],
      }],
    });
  });

  /* 대국이 아직 성단되지 않은 코어 — 구간 케이블 건너편에서 길이 끊긴다. 마디가 없는 것이 답이다. */
  it('성단되지 않은 코어는 마디가 하나도 서지 않는다', () => {
    const tree = buildTraceTree([
      cable('devA', 'slot1-front3', 'jumper-a'),
      { kind: 'internal', fromPortId: 'slot1-front3', toPortId: 'slot1-opgw', core: 3 },
      { kind: 'cable', fromPortId: 'slot1-opgw', toPortId: 'remote-opgw', cableId: 'opgw', core: 3 },
    ], 'devA');
    expect(tree.children).toEqual([{ portId: 'slot1-front3', cableId: 'jumper-a', children: [] }]);
  });

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

/**
 * 레인 그래프 — **모이는 그림**을 좁은 세로 칸에.
 *
 * 트리는 갈라지는 것만 그린다. 거슬러 오르는 길은 여럿이 나에게로 모이므로 트리가 아니고,
 * 그래서 커밋 그래프와 같은 레인으로 그린다. 값이 되는 성질: **깊이가 늘어도 폭이 안 변한다.**
 */
describe('traceLanes — 모이는 그림', () => {
  const n = (portId: string, ...children: TraceTreeNode[]): TraceTreeNode =>
    ({ portId, children } as TraceTreeNode);
  /** 한 줄을 글자로 — 레인 자리에 마디(●)·합류(╯)·지나감(│)을 찍는다. */
  const show = (rows: ReturnType<typeof traceLanes>) => rows.map((r) => {
    const width = Math.max(r.lane, ...r.merges, ...r.through) + 1;
    const cells = Array.from({ length: width }, (_, i) =>
      i === r.lane ? '●' : r.merges.includes(i) ? '╯' : r.through.includes(i) ? '│' : ' ');
    return `${cells.join('')} ${r.node.portId}`;
  });

  /** 강압기의 상류 — 정류기 둘이 각자 교류에서 오고, 모선에서 합쳐져 나에게 온다. */
  it('출처가 위, 내가 맨 아래 — 합류 자리에서 레인이 닫힌다', () => {
    const tree = n('SID', n('분배부DC', n('IR1', n('AC1')), n('IR2', n('AC2')), n('축전지')));
    expect(show(traceLanes(tree))).toEqual([
      '● AC1',
      '● IR1',
      '│● AC2',
      '│● IR2',
      '││● 축전지',
      '●╯╯ 분배부DC',
      '● SID',
    ]);
  });

  /** 곧은 길은 레인 하나 — 깊어져도 폭이 안 는다(들여쓰기 트리와 갈리는 자리). */
  it('깊어져도 레인은 하나뿐 — 폭이 안 변한다', () => {
    const deep = n('나', n('A', n('B', n('C', n('D')))));
    const rows = traceLanes(deep);
    expect(rows.map((r) => r.lane)).toEqual([0, 0, 0, 0, 0]);
    expect(rows.map((r) => r.node.portId)).toEqual(['D', 'C', 'B', 'A', '나']);
  });

  /**
   * 닫힌 레인은 **되쓴다** — 안 그러면 갈래가 끝나도 폭이 안 준다.
   *
   * a2 가 쓰던 레인 1은 A 에서 닫히고, 곧바로 b1 이 그 자리를 받는다. 폭은 **그때
   * 동시에 살아 있는 갈래 수**가 정한다 — b2 를 낼 때 A(0)·b1(1)·b2(2) 셋이라 셋이다.
   */
  it('닫힌 레인을 되쓴다 — 폭은 동시에 살아 있는 갈래 수', () => {
    const tree = n('나', n('A', n('a1'), n('a2')), n('B', n('b1'), n('b2')));
    const rows = traceLanes(tree);
    expect(rows.find((r) => r.node.portId === 'b1')!.lane).toBe(1); // a2 가 쓰던 자리
    expect(Math.max(...rows.map((r) => r.lane))).toBe(2);
    expect(show(rows)).toEqual([
      '● a1',
      '│● a2',
      '●╯ A',
      '│● b1',
      '││● b2',
      '│●╯ B',
      '●╯ 나',
    ]);
  });

  /** 뿌리(나)에서 레인이 끝나고, 잎(출처)에서 시작한다. */
  it('레인은 출처에서 시작해 나에게서 끝난다', () => {
    const rows = traceLanes(n('나', n('A')));
    expect(rows.map((r) => [r.node.portId, r.fromAbove, r.toBelow]))
      .toEqual([['A', false, true], ['나', true, false]]);
  });
});

/** 내려가는 추적 — 트리 모양 그대로지만 레인 그래프와 **같은 조각으로** 그릴 수 있게 편다. */
describe('traceIndentRows — 갈라지는 그림', () => {
  const n = (portId: string, ...children: TraceTreeNode[]): TraceTreeNode =>
    ({ portId, children } as TraceTreeNode);
  const show = (rows: ReturnType<typeof traceIndentRows>) => rows.map((r) => {
    const cells = Array.from({ length: r.depth }, (_, i) =>
      i === r.depth - 1 ? (r.last ? '└' : '├') : r.rails.includes(i) ? '│' : ' ');
    return `${cells.join('')}${r.node.portId}`;
  });

  it('뿌리가 맨 위, 갈래는 들여쓰기로 — 마지막 형제는 꺾여 끝난다', () => {
    expect(show(traceIndentRows(n('나', n('A', n('a1'), n('a2')), n('B')))))
      .toEqual(['나', '├A', '│├a1', '│└a2', '└B']);
  });

  /**
   * **곧은 길은 켜가 안 늘어난다** — 레인 그래프와 같은 규칙이다.
   *
   * 예전에는 외자식도 한 칸씩 들여썼다. 그래서 같은 곧은 사슬이 거슬러 오를 때는 한 줄,
   * 내려갈 때는 계단으로 보였다(사용자가 화면에서 신고). 구별할 형제가 없는데 들여써 봐야
   * 아무것도 말해 주지 않는다.
   */
  it('곧은 길은 켜가 안 늘어난다 — 갈래가 갈릴 때만 들여쓴다', () => {
    const rows = traceIndentRows(n('나', n('A', n('B', n('C')))));
    expect(rows.map((r) => `${r.depth}:${r.node.portId}:${r.branch ? '갈래' : '이어짐'}`))
      .toEqual(['0:나:이어짐', '0:A:이어짐', '0:B:이어짐', '0:C:이어짐']);
  });

  /** 갈래 뒤의 곧은 길도 **그 켜에 머문다.** */
  it('갈래에서 갈라진 뒤의 곧은 길은 그 켜에 머문다', () => {
    const rows = traceIndentRows(n('나', n('A', n('a1', n('x'))), n('B')));
    expect(rows.map((r) => `${r.depth}:${r.node.portId}${r.branch ? '(갈래)' : ''}`))
      .toEqual(['0:나', '1:A(갈래)', '1:a1', '1:x', '1:B(갈래)']);
  });

  /** 형제가 더 남았으면 그 켜에 세로선이 계속 지나간다 — 마지막이면 끊긴다. */
  it('지나가는 세로선은 형제가 남은 켜에만', () => {
    const rows = traceIndentRows(n('나', n('A', n('a1')), n('B', n('b1'))));
    expect(rows.map((r) => `${r.node.portId}:${r.rails.join(',')}`))
      .toEqual(['나:', 'A:', 'a1:0', 'B:', 'b1:']);
  });
});
