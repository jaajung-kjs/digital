/**
 * 토폴로지 그래프 위에서 두 노드 사이 최단 경로(홉 수)를 찾는다.
 * 무방향 BFS — 끊긴 엣지는 호출 측에서 edges 에서 미리 제외한다.
 */

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
}

/**
 * start 에서 end 까지 홉 수 최단 경로를 이루는 엣지 id 배열을 반환.
 * 경로가 없으면 null, start === end 면 빈 배열.
 * 같은 길이의 경로가 여럿이면 BFS 가 먼저 도달한 것을 쓴다.
 * 같은 두 노드를 잇는 평행 엣지가 여럿이면 edges 배열의 앞쪽 엣지를 쓴다.
 */
export function findShortestPath(
  edges: GraphEdge[],
  start: string,
  end: string,
): string[] | null {
  if (start === end) return [];

  // 인접 리스트 — 각 노드에서 (이웃 노드, 그 엣지 id).
  const adjacency = new Map<string, { node: string; edgeId: string }[]>();
  const link = (a: string, b: string, edgeId: string) => {
    const list = adjacency.get(a);
    if (list) list.push({ node: b, edgeId });
    else adjacency.set(a, [{ node: b, edgeId }]);
  };
  for (const e of edges) {
    link(e.source, e.target, e.id);
    link(e.target, e.source, e.id);
  }

  // BFS — 방문 노드마다 도달에 쓴 엣지를 기록해 경로를 역추적.
  const cameFrom = new Map<string, { prev: string; edgeId: string }>();
  const visited = new Set<string>([start]);
  const queue: string[] = [start];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === end) {
      const path: string[] = [];
      let node = end;
      while (node !== start) {
        const step = cameFrom.get(node)!;
        path.push(step.edgeId);
        node = step.prev;
      }
      return path.reverse();
    }
    for (const { node, edgeId } of adjacency.get(current) ?? []) {
      if (visited.has(node)) continue;
      visited.add(node);
      cameFrom.set(node, { prev: current, edgeId });
      queue.push(node);
    }
  }
  return null;
}
