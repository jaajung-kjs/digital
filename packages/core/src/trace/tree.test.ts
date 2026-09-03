import { describe, expect, it } from 'vitest';
import { buildTraceTree, traceChains, traceFlowRows, traceTreeSize } from './tree.js';
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
 * 상류는 트리가 아니라 **합류**다 — 출처 여럿이 나에게로 모인다.
 *
 * 길을 하나씩 펴면 겹치는 꼬리가 길마다 되풀이되고(출처 셋이면 꼬리도 세 번), 나를 뿌리로
 * 한 트리로 그리면 내려가는 추적과 **똑같이 생긴다**. 겹치는 꼬리를 한 번만 그리는 것이
 * 그 둘을 다 피하는 길이다.
 */
describe('traceFlowRows — 합류로 편 줄', () => {
  const n = (portId: string, ...children: TraceTreeNode[]): TraceTreeNode =>
    ({ portId, children } as TraceTreeNode);
  const show = (rows: ReturnType<typeof traceFlowRows>) =>
    rows.map((r) => r.map((c) => `${c.merge ? '>' : ''}${c.node.portId}`).join('→'));

  /** 강압기의 상류 — 정류기 둘이 모선을 먹인다. 꼬리(모선→나)는 한 번만 그린다. */
  it('출처가 둘이면 갈라진 앞부분만 줄이 되고, 꼬리는 마지막 줄에 한 번', () => {
    const tree = n('SID', n('분배부DC', n('IR1', n('분배부AC1')), n('IR2', n('분배부AC2'))));
    expect(show(traceFlowRows(tree))).toEqual([
      '분배부AC1→IR1',
      '분배부AC2→IR2→>분배부DC→SID',
    ]);
  });

  /** 출처가 하나면 줄도 하나 — 곧은 길에 특수 케이스를 두지 않는다. */
  it('곧은 길은 한 줄이고 합류 표시가 없다', () => {
    expect(show(traceFlowRows(n('IR1', n('분배부AC1'))))).toEqual(['분배부AC1→IR1']);
  });

  /* 합류는 **그 마디의 자식이 여럿일 때** 일어난다 — 줄 수로 세면 깊은 데서 갈라진 줄이
     그대로 올라와, 자식 하나짜리 마디까지 합류로 표시된다(강압기가 그랬다). */
  it('갈래가 겹쳐도 합류는 갈라지는 그 자리에만 선다', () => {
    const tree = n('나', n('A', n('B', n('C1'), n('C2')), n('B2', n('D1'), n('D2'))));
    expect(show(traceFlowRows(tree))).toEqual([
      'C1',
      'C2→>B',
      'D1',
      'D2→>B2→>A→나',
    ]);
  });

  /** 자리 맞춤은 **오른쪽 끝(나)** 을 기준으로 — 그래야 겹치는 꼬리가 줄마다 같은 칸에 선다. */
  it('마디마다 나에게서 몇 걸음인지를 들고 있다', () => {
    const rows = traceFlowRows(n('SID', n('분배부DC', n('IR1'), n('IR2'))));
    expect(rows.map((r) => r.map((c) => `${c.node.portId}:${c.distance}`))).toEqual([
      ['IR1:2'],
      ['IR2:2', '분배부DC:1', 'SID:0'],
    ]);
  });
});
