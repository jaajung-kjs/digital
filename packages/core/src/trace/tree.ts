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
      if (hop.kind === 'internal') {
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

/** 트리에 마디가 몇이나 되나 — 뿌리는 빼고 센다(「이 포트에서 닿는 곳」의 수). */
export function traceTreeSize(node: TraceTreeNode): number {
  return node.children.reduce((n, c) => n + 1 + traceTreeSize(c), 0);
}
