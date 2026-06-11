/**
 * 그래프 cycle (ring) 인식 — fundamental cycle basis.
 *
 * cable trace 와 네트워크 토폴로지 양쪽이 같은 알고리즘을 사용한다.
 * 그래서 ring 의 정의가 한 곳 (이 파일) 에서만 정해지고,
 * 두 시각이 같은 의미의 ring 을 그릴 수 있다.
 *
 * 알고리즘:
 *   1. BFS spanning tree 빌드 → tree edge 와 chord (non-tree edge) 분리
 *   2. 각 chord 가 정확히 하나의 fundamental cycle 형성 (LCA 까지 양 path + chord)
 *   3. edge 를 공유하는 cycle 들을 Union-Find 로 그룹화
 *   4. 그룹의 cycle 2개 이상이면 composite ring (level 1 = 대링) 추가 (edge XOR 로 외곽)
 */

import type { TraceEdge, TraceNode, TraceRing } from '../../features/pathTrace/types';

/** Canonical key for an unordered node pair. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}\0${b}` : `${b}\0${a}`;
}

export function detectRings(
  adjacency: Map<string, Set<string>>,
  edgeMap: Map<string, TraceEdge>,
  nodeMap: Map<string, TraceNode>,
): TraceRing[] {
  if (edgeMap.size === 0) return [];

  // 1. Pair -> edgeIds lookup (supports parallel edges)
  const pairToEdgeIds = new Map<string, string[]>();
  for (const [edgeId, edge] of edgeMap) {
    const key = pairKey(edge.sourceAssetId, edge.targetAssetId);
    if (!pairToEdgeIds.has(key)) pairToEdgeIds.set(key, []);
    pairToEdgeIds.get(key)!.push(edgeId);
  }

  // 2. BFS spanning tree
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
        treeParent.set(neighborId, { parentId: nodeId, edgeId: edgeIds[0] });
        treeEdgeIds.add(edgeIds[0]);
        queue.push(neighborId);
      }
    }
  }

  // 3. Identify chords (non-tree edges)
  const chords: { edgeId: string; u: string; v: string }[] = [];
  for (const [edgeId, edge] of edgeMap) {
    if (!treeEdgeIds.has(edgeId)) {
      chords.push({ edgeId, u: edge.sourceAssetId, v: edge.targetAssetId });
    }
  }
  if (chords.length === 0) return [];

  // 4. For each chord, find fundamental cycle via LCA
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

    // Merge: u->LCA + reverse(v->LCA without LCA) + chord
    const cycleNodeIds = [
      ...new Set([...pathU.nodeIds, ...pathV.nodeIds.slice(0, -1).reverse()]),
    ];
    const cycleEdgeIds = [...pathU.edgeIds, ...pathV.edgeIds, chord.edgeId];

    // Skip degenerate cycles (parallel edges between 2 nodes)
    if (cycleNodeIds.length >= 3) {
      fundamentals.push({ nodeIds: cycleNodeIds, edgeIds: cycleEdgeIds });
    }
  }
  if (fundamentals.length === 0) return [];

  // 5. Group cycles sharing edges (Union-Find)
  const n = fundamentals.length;
  const uf = Array.from({ length: n }, (_, i) => i);
  function find(x: number): number {
    while (uf[x] !== x) {
      uf[x] = uf[uf[x]];
      x = uf[x];
    }
    return x;
  }

  const edgeSets = fundamentals.map((c) => new Set(c.edgeIds));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (const eid of edgeSets[i]) {
        if (edgeSets[j].has(eid)) {
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

  // 6. Build TraceRings (level 0 + level 1)
  const rings: TraceRing[] = [];
  let counter = 0;

  function buildLabel(nodeIds: Iterable<string>): string {
    const names = new Set<string>();
    for (const nid of nodeIds) {
      const node = nodeMap.get(nid);
      if (node?.substationName) names.add(node.substationName);
    }
    return Array.from(names).join('↔');
  }

  for (const cycleIndices of groups.values()) {
    const childIds: string[] = [];

    // Fundamental rings (level 0)
    for (const idx of cycleIndices) {
      counter++;
      const id = `ring-${counter}`;
      childIds.push(id);
      rings.push({
        id,
        label: buildLabel(fundamentals[idx].nodeIds),
        nodeIds: fundamentals[idx].nodeIds,
        edgeIds: fundamentals[idx].edgeIds,
        level: 0,
        childRingIds: [],
      });
    }

    // Composite ring (level 1) — only when multiple cycles share edges
    if (cycleIndices.length > 1) {
      const edgeCount = new Map<string, number>();
      for (const idx of cycleIndices) {
        for (const eid of fundamentals[idx].edgeIds) {
          edgeCount.set(eid, (edgeCount.get(eid) ?? 0) + 1);
        }
      }

      // XOR: edges appearing odd times form the outer perimeter
      const outerEdgeIds = [...edgeCount.entries()]
        .filter(([, c]) => c % 2 === 1)
        .map(([eid]) => eid);

      const outerNodeIds = new Set<string>();
      for (const eid of outerEdgeIds) {
        const edge = edgeMap.get(eid);
        if (edge) {
          outerNodeIds.add(edge.sourceAssetId);
          outerNodeIds.add(edge.targetAssetId);
        }
      }

      counter++;
      rings.push({
        id: `ring-${counter}`,
        label: buildLabel(outerNodeIds),
        nodeIds: [...outerNodeIds],
        edgeIds: outerEdgeIds,
        level: 1,
        childRingIds: childIds,
      });
    }
  }

  return rings;
}
