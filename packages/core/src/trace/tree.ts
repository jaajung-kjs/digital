import type { TraceHop } from './graph.js';

/**
 * 추적 결과를 **트리로** 세운다 — 갈래는 갈래로, 곧은 길은 곧게.
 *
 * `traceFrom` 이 주는 것은 너비 우선으로 훑은 **평평한 홉 목록**이다. 화면은 그것을 번호가
 * 붙은 한 줄짜리 목록으로 폈는데, 그러면 두 가지가 사라진다:
 *
 * - **갈래**: 분전반 피더 하나에서 열 회로가 나가면 열 개가 같은 깊이의 형제인데, 평평한
 *   목록에서는 그냥 2·3·4… 번으로 줄줄이 서서 직렬로 읽힌다.
 * - **뜻**: 「↔ 내부」 라는 줄이 사이사이 끼었다. 그것은 **장비 안에서 포트가 바뀐 것**이지
 *   어디로 간 것이 아니다 — 사람이 알고 싶은 것은 「무엇을 거쳐 어디에 닿았나」다.
 *
 * 그래서 **케이블을 타고 닿은 자리만** 마디가 된다. 장비 안의 통과는 마디를 만들지 않고,
 * 그 장비에서 나가는 갈래들을 **그 자리에 붙인다** — 들어온 포트와 나가는 포트가 다르다는
 * 사실은 다음 마디의 이름이 이미 말한다.
 *
 * **다심(OPGW) 포트도 마디가 아니다.** 케이블로 닿기는 하지만 거기 서 있는 것은 아무것도
 * 없다 — 코어가 지나가는 자리일 뿐이고, 그 너머의 성단·점퍼를 거쳐야 비로소 장비가 나온다.
 * 마디로 세웠더니 24심이 다 같은 포트 하나라 이름이 `슬롯#1` 로 겹쳤고, 무엇보다 **거기서
 * 끝난 길은 아무 데도 닿지 않은 길**이었다(대국이 아직 성단되지 않은 코어). 접어 두면
 * 이어진 코어는 그 장비가 마디로 서고, 안 이어진 코어는 마디가 없다 — 그대로가 답이다.
 */
export interface TraceTreeNode {
  /** 이 마디에 닿은 포트 — 뿌리는 추적을 시작한 포트다. */
  portId: string;
  /** 여기로 오는 데 탄 케이블 — 뿌리에는 없다. */
  cableId?: string;
  /** 여기서 갈라져 나가는 길들. */
  children: TraceTreeNode[];
}

/**
 * 홉 목록 → 트리. 홉은 한 포트를 **한 번만** 방문하므로(`traceFrom` 의 `visited`) 이미
 * 뻗은 나무이고, 여기서 하는 일은 그 부모-자식을 세우고 내부 통과를 접는 것뿐이다.
 */
export function buildTraceTree(hops: readonly TraceHop[], startPortId: string): TraceTreeNode {
  const childrenOf = new Map<string, TraceHop[]>();
  for (const hop of hops) {
    const list = childrenOf.get(hop.fromPortId);
    if (list) list.push(hop);
    else childrenOf.set(hop.fromPortId, [hop]);
  }

  /**
   * 이 포트에서 뻗는 갈래들 — **케이블만 마디가 된다.**
   *
   * 내부 통과는 마디를 만들지 않고 그 너머를 이 자리로 끌어올린다(접기). 같은 장비 안에서
   * 포트를 두 번 갈아타도 마찬가지다 — 접힌 자리는 재귀가 알아서 따라간다.
   */
  const branchesOf = (portId: string, seen: Set<string>): TraceTreeNode[] => {
    if (seen.has(portId)) return [];
    seen.add(portId);
    const out: TraceTreeNode[] = [];
    for (const hop of childrenOf.get(portId) ?? []) {
      /* 내부 통과와 **다심 포트로 드는 길**은 마디를 만들지 않는다 — 둘 다 지나가는 자리다.
         (`core` 는 다심으로 들어갈 때만 붙는다 — `traceFrom` 참조) */
      if (hop.kind === 'internal' || hop.core !== undefined) {
        out.push(...branchesOf(hop.toPortId, seen));
        continue;
      }
      const node: TraceTreeNode = { portId: hop.toPortId, children: branchesOf(hop.toPortId, seen) };
      if (hop.cableId !== undefined) node.cableId = hop.cableId;
      out.push(node);
    }
    return out;
  };

  return { portId: startPortId, children: branchesOf(startPortId, new Set()) };
}

/**
 * 트리를 **끝까지 가는 길들**로 편다 — 뿌리에서 잎 하나까지가 한 길이다.
 *
 * 거슬러 오르는 추적(내 전원이 어디서 오나)은 트리로 읽히지 않는다. 답은 「출처에서 나에게
 * 오는 길」이고, 사람은 그것을 **전기가 흐르는 차례**로 읽는다 — 출처가 위, 내가 아래.
 * 그러려면 길을 하나씩 뽑아 뒤집어야 한다. 갈래가 있으면(이중 인입) 길이 여럿이고, 그때는
 * 「이 두 길로 전원이 온다」가 맞는 답이다.
 *
 * 뿌리를 포함해서 돌려준다 — 뒤집으면 그 뿌리가 **마지막**(내가 선 자리)이 된다.
 */
export function traceChains(root: TraceTreeNode): TraceTreeNode[][] {
  if (root.children.length === 0) return [[root]];
  return root.children.flatMap((child) => traceChains(child).map((path) => [root, ...path]));
}

/** 트리에 마디가 몇이나 되나 — 뿌리는 빼고 센다(「이 포트에서 닿는 곳」의 수). */
export function traceTreeSize(node: TraceTreeNode): number {
  return node.children.reduce((n, c) => n + 1 + traceTreeSize(c), 0);
}

/** 합류로 편 줄에 선 마디 하나 — 왼쪽에서 오른쪽으로 흐른다. */
export interface TraceFlowCell {
  node: TraceTreeNode;
  /** 오른쪽 끝(내가 선 자리)에서 몇 걸음 떨어졌나 — 0이 나다. 줄 사이 자리를 맞추는 데 쓴다. */
  distance: number;
  /** 여기서 **앞선 줄들이 합류한다** — 이 마디부터는 함께 흐른다. */
  merge: boolean;
}

/**
 * 거슬러 오르는 추적을 **흐르는 차례의 줄들**로 편다 — 출처가 왼쪽, 내가 오른쪽.
 *
 * 상류는 트리가 아니라 **합류**다: 출처 여럿이 나에게로 모인다. 트리는 갈라지기만 하므로
 * 그 모양을 담을 수 없고, 길을 하나씩 펴면 겹치는 꼬리가 길마다 되풀이된다(출처가 셋이면
 * 꼬리도 세 번).
 *
 * 그래서 **겹치는 꼬리는 한 번만 그린다.** 갈라지는 앞부분은 줄마다 따로 서고, 합류점부터는
 * 마지막 줄에 이어 붙는다 — 그 자리에 합류 표시가 선다.
 *
 *   분배부#1 → IR-48#1
 *   분배부#2 → IR-48#2  ⟩  분배부#2 → SID-125
 *
 * `distance` 로 줄 사이 자리를 맞춘다(오른쪽 끝이 나). 앞선 줄이 어느 칸에서 끊기는지가
 * 곧 어느 자리에서 합류하는지다.
 */
export function traceFlowRows(root: TraceTreeNode): TraceFlowCell[][] {
  /** 나에게서 몇 걸음인가 — 잎(출처)이 가장 멀다. */
  const walk = (node: TraceTreeNode, distance: number): TraceFlowCell[][] => {
    if (node.children.length === 0) return [[{ node, distance, merge: false }]];
    const rows = node.children.flatMap((child) => walk(child, distance + 1));
    /* 마지막 줄에 나를 잇는다. 합류는 **이 마디의 자식이 여럿일 때** 일어난다 — 줄 수로
       세면 안 된다: 깊은 데서 갈라진 줄이 그대로 올라오므로, 자식 하나짜리 마디까지
       합류로 표시된다(강압기가 그랬다). */
    rows[rows.length - 1]!.push({ node, distance, merge: node.children.length > 1 });
    return rows;
  };
  return walk(root, 0);
}
