import type { Ring, TopoEdge } from './types.js';

/** 마디 쌍의 순서 없는 키 — 인접 목록을 pairKey 로 찾는다. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}\0${b}` : `${b}\0${a}`;
}

/**
 * 링 인식 — **소링과 대링**.
 *
 * 1. BFS 신장트리를 세워 트리 간선과 chord(트리에 안 든 간선)를 가른다
 * 2. chord 하나가 기본 순환 하나를 만든다(양 끝에서 LCA 까지 올라간 두 길 + chord)
 * 3. 간선을 공유하는 순환들을 Union-Find 로 묶는다
 * 4. 묶음에 순환이 둘 이상이면 **대링**을 하나 더 낸다 — 간선을 홀수 번 쓴 것만 남기면
 *    (XOR) 그것이 바깥 테두리다. 배치가 그 테두리를 원으로 놓으면 공유 구간은 저절로
 *    그 원을 가로지르는 현이 된다(옛 SPQR 레이아웃 529줄이 하던 일이다).
 *
 * 마디 둘짜리 순환(평행 간선)은 세지 않는다. 이중화이지 원으로 그릴 링이 아니다.
 */
export function detectRings(edges: readonly TopoEdge[]): Ring[] {
  if (edges.length === 0) return [];

  const edgeMap = new Map(edges.map((e) => [e.id, e]));

  // ── 인접 목록 — 간선에서 안에서 만든다 ──────────────────────────────
  const adjacency = new Map<string, Set<string>>();
  const addAdj = (a: string, b: string) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    adjacency.get(a)!.add(b);
  };
  for (const edge of edges) {
    addAdj(edge.source, edge.target);
    addAdj(edge.target, edge.source);
  }

  // 1. Pair -> edgeIds — 평행 간선도 지원한다
  const pairToEdgeIds = new Map<string, string[]>();
  for (const [edgeId, edge] of edgeMap) {
    const key = pairKey(edge.source, edge.target);
    if (!pairToEdgeIds.has(key)) pairToEdgeIds.set(key, []);
    pairToEdgeIds.get(key)!.push(edgeId);
  }

  // 2. BFS 신장트리
  const treeParent = new Map<string, { parentId: string; edgeId: string } | null>();
  const treeEdgeIds = new Set<string>();
  const visited = new Set<string>();

  for (const startId of adjacency.keys()) {
    if (visited.has(startId)) continue;
    visited.add(startId);
    treeParent.set(startId, null);
    const queue = [startId];
    let qHead = 0;

    while (qHead < queue.length) {
      const nodeId = queue[qHead++]!;
      for (const neighborId of adjacency.get(nodeId) ?? []) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        const key = pairKey(nodeId, neighborId);
        const edgeIds = pairToEdgeIds.get(key);
        if (!edgeIds || edgeIds.length === 0) continue;
        treeParent.set(neighborId, { parentId: nodeId, edgeId: edgeIds[0]! });
        treeEdgeIds.add(edgeIds[0]!);
        queue.push(neighborId);
      }
    }
  }

  // 3. chord(트리에 안 든 간선) 찾기
  const chords: { edgeId: string; u: string; v: string }[] = [];
  for (const [edgeId, edge] of edgeMap) {
    if (!treeEdgeIds.has(edgeId)) {
      chords.push({ edgeId, u: edge.source, v: edge.target });
    }
  }
  if (chords.length === 0) return [];

  // 4. chord 마다 LCA 로 기본 순환을 만든다
  function ancestorList(nodeId: string): string[] {
    const path = [nodeId];
    let cur = nodeId;
    while (treeParent.get(cur)) {
      cur = treeParent.get(cur)!.parentId;
      path.push(cur);
    }
    return path;
  }

  function pathTo(from: string, to: string): { nodeIds: string[]; edgeIds: string[] } {
    const nodeIds = [from];
    const edgeIds: string[] = [];
    let cur = from;
    while (cur !== to) {
      const p = treeParent.get(cur);
      if (!p) break;
      edgeIds.push(p.edgeId);
      nodeIds.push(p.parentId);
      cur = p.parentId;
    }
    return { nodeIds, edgeIds };
  }

  const fundamentals: { nodeIds: string[]; edgeIds: string[] }[] = [];

  for (const chord of chords) {
    const ancestorsU = ancestorList(chord.u);
    const ancestorSetU = new Set(ancestorsU);
    const ancestorsV = ancestorList(chord.v);

    let lca: string | null = null;
    for (const a of ancestorsV) {
      if (ancestorSetU.has(a)) {
        lca = a;
        break;
      }
    }
    if (!lca) continue;

    const pathU = pathTo(chord.u, lca);
    const pathV = pathTo(chord.v, lca);

    // u->LCA + reverse(v->LCA, LCA 빼고) + chord
    const cycleNodeIds = [
      ...new Set([...pathU.nodeIds, ...pathV.nodeIds.slice(0, -1).reverse()]),
    ];
    const cycleEdgeIds = [...pathU.edgeIds, ...pathV.edgeIds, chord.edgeId];

    // 마디 둘짜리 순환(평행 간선)은 링이 아니다 — 이중화일 뿐 원으로 그릴 것이 없다
    if (cycleNodeIds.length >= 3) {
      fundamentals.push({ nodeIds: cycleNodeIds, edgeIds: cycleEdgeIds });
    }
  }
  if (fundamentals.length === 0) return [];

  // 5. 간선을 공유하는 순환들을 Union-Find 로 묶는다
  const n = fundamentals.length;
  const uf = Array.from({ length: n }, (_, i) => i);
  function find(x: number): number {
    while (uf[x] !== x) {
      uf[x] = uf[uf[x]!]!;
      x = uf[x]!;
    }
    return x;
  }

  const edgeSets = fundamentals.map((c) => new Set(c.edgeIds));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (const eid of edgeSets[i]!) {
        if (edgeSets[j]!.has(eid)) {
          uf[find(i)] = find(j);
          break;
        }
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(i);
  }

  // 6. 소링(level 0) + 대링(level 1) 을 낸다
  const rings: Ring[] = [];
  let counter = 0;

  for (const cycleIndices of groups.values()) {
    const childIds: string[] = [];

    // 소링 — 기본 순환 그대로
    for (const idx of cycleIndices) {
      counter++;
      const id = `ring-${counter}`;
      childIds.push(id);
      rings.push({
        id,
        nodeIds: fundamentals[idx]!.nodeIds,
        edgeIds: fundamentals[idx]!.edgeIds,
        level: 0,
        childRingIds: [],
      });
    }

    // 대링 — 순환이 둘 이상 묶였을 때만, 공유 간선을 뺀 바깥 테두리
    if (cycleIndices.length > 1) {
      const edgeCount = new Map<string, number>();
      for (const idx of cycleIndices) {
        for (const eid of fundamentals[idx]!.edgeIds) {
          edgeCount.set(eid, (edgeCount.get(eid) ?? 0) + 1);
        }
      }

      // XOR: 홀수 번 쓰인 간선만 남으면 바깥 테두리다
      const outerEdgeIds = [...edgeCount.entries()]
        .filter(([, c]) => c % 2 === 1)
        .map(([eid]) => eid);

      // 마디는 Set 을 펴서 내지 않는다 — 테두리 간선을 따라 걸어야 도는 차례가 나온다.
      // 배치가 이 차례대로 원 위에 놓으므로, 순서가 뒤섞이면 줄이 서로를 가로지른다.
      const outerAdjacency = new Map<string, string[]>();
      for (const eid of outerEdgeIds) {
        const edge = edgeMap.get(eid);
        if (!edge) continue;
        if (!outerAdjacency.has(edge.source)) outerAdjacency.set(edge.source, []);
        if (!outerAdjacency.has(edge.target)) outerAdjacency.set(edge.target, []);
        outerAdjacency.get(edge.source)!.push(edge.target);
        outerAdjacency.get(edge.target)!.push(edge.source);
      }

      const outerNodeIds: string[] = [];
      const usedPairKeys = new Set<string>();
      let edgesWalked = 0;
      const startId = outerEdgeIds.length > 0 ? edgeMap.get(outerEdgeIds[0]!)!.source : null;
      if (startId) {
        let cur = startId;
        do {
          outerNodeIds.push(cur);
          const next = (outerAdjacency.get(cur) ?? []).find(
            (nb) => !usedPairKeys.has(pairKey(cur, nb)),
          );
          if (next === undefined) break;
          usedPairKeys.add(pairKey(cur, next));
          edgesWalked++;
          cur = next;
        } while (cur !== startId);
      }

      /*
       * 「테두리는 각 마디의 차수가 2인 순환」은 소링이 둘일 때만 참이다. 소링 셋 이상이
       * 한 마디(허브)에서 만나면 XOR 결과에서 그 마디 차수가 4 이상이 되고, 걷기가
       * 시작 마디로 먼저 돌아오며 멈춰 나머지 간선·마디를 못 담는다. 걷기가 XOR 간선을
       * 다 덮었는지(edgesWalked === outerEdgeIds.length)로 그걸 검사한다 — 못 덮었으면
       * 그릴 원이 없다는 뜻이므로 대링을 내지 않고 소링만 남긴다(빈 테두리도 이 검사에
       * 자연히 걸린다). 배치는 그때 소링들을 공유 마디에서 접하게 놓는다.
       *
       * 간선을 다 덮어도 **마디**를 다 덮는다는 보장은 없다 — 허브 둘 사이에 갈래가
       * 셋이면 XOR 은 그중 넷으로 이뤄진 멀쩡한 단일 순환을 내지만, 다섯째 갈래의
       * 마디는 그 순환에 안 든다. 대링이 제 소링 묶음의 마디를 다 못 덮으면 그 마디는
       * 나중에 가지로 뻗어 나오고, 그 가지의 줄이 원 반대편 마디를 관통한다(실측). 제
       * 묶음을 다 덮지 못하는 것은 바깥 테두리가 아니므로 이때도 대링을 내지 않는다.
       */
      const groupNodeIds = new Set(cycleIndices.flatMap((idx) => fundamentals[idx]!.nodeIds));
      const coversGroupNodes = [...groupNodeIds].every((id) => outerNodeIds.includes(id));

      if (outerEdgeIds.length > 0 && edgesWalked === outerEdgeIds.length && coversGroupNodes) {
        counter++;
        rings.push({
          id: `ring-${counter}`,
          nodeIds: outerNodeIds,
          edgeIds: outerEdgeIds,
          level: 1,
          childRingIds: childIds,
        });
      }
    }
  }

  return rings;
}
