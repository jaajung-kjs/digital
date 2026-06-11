/**
 * SPQR-tree composition layout — BC-tree layout 의 super-set.
 *
 * `bcTreeLayout` 이 처리 못 한 SPQR P/R-node 케이스 (cycleDetection 이 level-1
 * composite ring 으로 표시) 를 정석으로 처리:
 *
 *   • S-node (simple cycle, 단일 fundamental ring) → 정다각형 (= bcTree 와 동일)
 *   • P-node (theta-graph, K 개 평행 path 가 2 vertex 공유) → poles 수평축 +
 *     K 개 arc 분배
 *   • R-node (3-connected planar, edges 공유) → Tutte's barycentric
 *     embedding (외곽 face 는 convex polygon, 내부는 neighbor 평균 iter)
 *
 * 각 block 을 독립 layout 한 뒤 cut vertex 에서 tangent 로 합성 (BC-tree 와 동일).
 *
 * Dispatcher 분기 (`NetworkTopologyModal.tsx`):
 *   traceResult.rings.some(r => r.level === 1)
 *     ? computeLayoutSPQR(...)  // 이 파일
 *     : computeLayoutBCTree(...) // 기존 — 변경 없음
 *
 * 즉 BC-tree friendly 그래프는 이 코드 path 자체 미진입 → 회귀 0 보장.
 *
 * Reference:
 *   - Hopcroft-Tarjan SPQR-tree
 *   - Tutte's barycentric embedding (1963)
 *   - OGDF PlanarizationLayout
 */

import type { TraceEdge, TraceRing } from '../../pathTrace/types';
import { BOX_W, LEAF_GAP, MIN_NODE_DISTANCE, NODE_GAP, resolveOverlap, ringRadius } from './geometry';

// ─── Block types ────────────────────────────────────────────────────────
interface BlockS {
  kind: 'S';
  /** OFD id cyclic order */
  cyclicOFDs: string[];
}
interface BlockP {
  kind: 'P';
  /** 2 pole OFD ids */
  poles: [string, string];
  /** Each path = inner OFD ids from pole[0] to pole[1] (excluding poles themselves). length=0 면 직접 edge. */
  paths: string[][];
}
interface BlockR {
  kind: 'R';
  /** 외곽 face OFD ids cyclic order (= level-1 composite ring 의 perimeter) */
  outerOFDs: string[];
  /** 내부 vertex OFD ids (모든 block 멤버 중 외곽 아닌 것) */
  innerOFDs: string[];
  /** block 의 인접도 — Tutte iteration 에서 neighbor 평균 계산용 (rebuild 회피) */
  adj: Map<string, Set<string>>;
}
type Block = BlockS | BlockP | BlockR;

export interface SPQRLayoutInput {
  nodeIds: string[];
  ofdToGroup: Map<string, string>;
  edges: TraceEdge[];
  rings: TraceRing[];
}

export function computeLayoutSPQR(input: SPQRLayoutInput): Map<string, { x: number; y: number }> {
  const { nodeIds, ofdToGroup, edges, rings } = input;
  const positions = new Map<string, { x: number; y: number }>(); // groupId → pos
  const nodeRingCenter = new Map<string, { x: number; y: number }>(); // groupId → 소속 block 중심 (외측 방향용)

  // ─── 1. FP adjacency (OFD-level) ─────────────────────────────────────
  const ofdAdj = new Map<string, Set<string>>();
  for (const e of edges) {
    if (e.type !== 'fiberPath') continue;
    if (e.sourceAssetId === e.targetAssetId) continue;
    if (!ofdAdj.has(e.sourceAssetId)) ofdAdj.set(e.sourceAssetId, new Set());
    if (!ofdAdj.has(e.targetAssetId)) ofdAdj.set(e.targetAssetId, new Set());
    ofdAdj.get(e.sourceAssetId)!.add(e.targetAssetId);
    ofdAdj.get(e.targetAssetId)!.add(e.sourceAssetId);
  }

  // ─── 2. Block 구성 ─────────────────────────────────────────────────
  //   level-1 ring → 한 P 또는 R block
  //   level-1 에 속하지 않은 level-0 ring → 독립 S block
  const compositeRings = rings.filter((r) => r.level === 1);
  const inCompositeRingIds = new Set<string>();
  for (const cr of compositeRings) cr.childRingIds.forEach((id) => inCompositeRingIds.add(id));

  const blocks: Block[] = [];

  // S-blocks (cut-vertex 공유만 하는 단순 cycle)
  for (const r of rings.filter((rr) => rr.level === 0 && !inCompositeRingIds.has(rr.id))) {
    blocks.push({ kind: 'S', cyclicOFDs: r.nodeIds });
  }

  // P/R-blocks (composite ring 단위)
  //   cycleDetection 의 fundamental cycle 들은 spanning tree path 를 공유해서 "common vertex"
  //   가 진짜 poles 가 아닌 경우 많음. 따라서 *실제 2-vertex cut* 을 brute force 로 찾는다.
  const edgeMap = new Map(edges.map((e) => [e.id, e] as const));
  const ringById = new Map(rings.map((r) => [r.id, r] as const));
  for (const cr of compositeRings) {
    const childRings = cr.childRingIds.map((id) => ringById.get(id)).filter((r): r is TraceRing => !!r);
    // block 의 OFD 와 인접도 모음
    const blockOFDs = new Set<string>();
    const blockAdj = new Map<string, Set<string>>();
    const seenEdge = new Set<string>();
    for (const c of childRings) {
      for (const n of c.nodeIds) blockOFDs.add(n);
      for (const eid of c.edgeIds) {
        if (seenEdge.has(eid)) continue;
        seenEdge.add(eid);
        const e = edgeMap.get(eid);
        if (!e) continue;
        const a = e.sourceAssetId;
        const b = e.targetAssetId;
        if (!blockAdj.has(a)) blockAdj.set(a, new Set());
        if (!blockAdj.has(b)) blockAdj.set(b, new Set());
        blockAdj.get(a)!.add(b);
        blockAdj.get(b)!.add(a);
      }
    }

    const cut = findTwoVertexCut(blockOFDs, blockAdj);
    if (cut) {
      const paths = extractPaths(blockOFDs, blockAdj, cut);
      blocks.push({ kind: 'P', poles: cut, paths });
    } else {
      // R-node — 가장 큰 child ring 을 외곽 face 로
      let outer = childRings[0];
      for (const c of childRings) if (c.nodeIds.length > outer.nodeIds.length) outer = c;
      const outerOFDs = outer.nodeIds;
      const outerSet = new Set(outerOFDs);
      const innerOFDs = [...blockOFDs].filter((n) => !outerSet.has(n));
      blocks.push({ kind: 'R', outerOFDs, innerOFDs, adj: blockAdj });
    }
  }

  // ─── 3. OFD → block index 매핑 (cut vertex = 2+ blocks 에 속함) ────────
  const ofdBlocks = new Map<string, number[]>();
  blocks.forEach((b, idx) => {
    const members = blockMembers(b);
    for (const m of members) {
      if (!ofdBlocks.has(m)) ofdBlocks.set(m, []);
      ofdBlocks.get(m)!.push(idx);
    }
  });

  // ─── 4. block 각각 layout (anchor 기반 변환 가능하게 *상대* 좌표 우선 계산) ──
  //   placeBlock 은 anchor (이미 배치된 OFD) 와 그것의 *원하는* 각도를 받아
  //   block 의 좌표를 positions 에 기록.
  const placed = new Set<number>(); // 이미 배치된 block index 들
  const fannedOut = new Set<string>(); // 한 junction 에서 fan-out 이미 함

  function placeBlock(blockIdx: number, anchorOFD: string | null, anchorAngle: number) {
    if (placed.has(blockIdx)) return;
    placed.add(blockIdx);
    const block = blocks[blockIdx];

    switch (block.kind) {
      case 'S':
        placeS(block, anchorOFD, anchorAngle);
        break;
      case 'P':
        placeP(block, anchorOFD, anchorAngle);
        break;
      case 'R':
        placeR(block, anchorOFD, anchorAngle);
        break;
    }

    // 재귀: 이 block 의 cut-vertex 에서 다른 block 들로 fan-out
    const members = blockMembers(block);
    for (const ofdId of members) {
      if (fannedOut.has(ofdId)) continue;
      const adjBlocks = (ofdBlocks.get(ofdId) ?? []).filter((bi) => !placed.has(bi));
      if (adjBlocks.length === 0) continue;
      fannedOut.add(ofdId);

      // K = 1 (현재 block) + outgoing block 수
      const K = 1 + adjBlocks.length;
      const angleStep = (2 * Math.PI) / K;
      const jp = positions.get(ofdToGroup.get(ofdId)!)!;
      const center = nodeRingCenter.get(ofdToGroup.get(ofdId)!);
      const dirToCurrent = center ? Math.atan2(center.y - jp.y, center.x - jp.x) : 0;

      adjBlocks.forEach((nextIdx, k) => {
        const outDir = dirToCurrent + (k + 1) * angleStep;
        placeBlock(nextIdx, ofdId, outDir + Math.PI);
      });
    }
  }

  // ─── 5. S-block 배치 (= bcTreeLayout 의 polygon 로직 재구현) ────────────
  function placeS(block: BlockS, anchorOFD: string | null, anchorAngle: number) {
    const N = block.cyclicOFDs.length;
    const R = ringRadius(N);
    let cx: number;
    let cy: number;
    let anchorIdx = 0;
    if (anchorOFD === null) {
      cx = 0;
      cy = 0;
    } else {
      const a = positions.get(ofdToGroup.get(anchorOFD)!)!;
      cx = a.x - R * Math.cos(anchorAngle);
      cy = a.y - R * Math.sin(anchorAngle);
      anchorIdx = block.cyclicOFDs.findIndex((n) => n === anchorOFD);
      if (anchorIdx < 0) anchorIdx = 0;
    }
    for (let i = 0; i < N; i++) {
      const ofd = block.cyclicOFDs[i];
      const gid = ofdToGroup.get(ofd);
      if (!gid) continue;
      if (!positions.has(gid)) {
        const offset = (i - anchorIdx + N) % N;
        const angle = anchorAngle + offset * ((2 * Math.PI) / N);
        positions.set(gid, { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) });
      }
      nodeRingCenter.set(gid, { x: cx, y: cy });
    }
  }

  // ─── 6. P-block (theta-graph) 배치 ────────────────────────────────────
  function placeP(block: BlockP, anchorOFD: string | null, anchorAngle: number) {
    const [poleA, poleB] = block.poles;
    // pole 간 거리: 가장 긴 path 길이에 맞춰
    const maxLen = Math.max(...block.paths.map((p) => p.length), 1);
    const D = Math.max((BOX_W + NODE_GAP) * (maxLen + 1), BOX_W + NODE_GAP);
    const H_STEP = BOX_W + NODE_GAP;

    // anchor 가 있으면 anchor 가 poles[0] 또는 poles[1] 일 것 — 그 위치 fix.
    // 없으면 poleA 를 (-D/2, 0), poleB 를 (D/2, 0) 에 배치.
    let aPos: { x: number; y: number };
    let bPos: { x: number; y: number };
    let center: { x: number; y: number };
    if (anchorOFD === null) {
      aPos = { x: -D / 2, y: 0 };
      bPos = { x: D / 2, y: 0 };
      center = { x: 0, y: 0 };
    } else {
      const apos = positions.get(ofdToGroup.get(anchorOFD)!)!;
      // anchor 위치 fix, 다른 pole 은 anchor 기준 outDir 방향 (anchorAngle + π) 으로 D 만큼
      const outDir = anchorAngle + Math.PI; // anchor 가 block 내에서 보는 "block 중심 방향" 의 반대 = 외부 방향. center 가 anchor 의 반대편.
      // 사실 단순화: anchor 가 poleA 라 가정, poleB 는 anchor 에서 +D 만큼 outDir 방향.
      if (anchorOFD === poleA) {
        aPos = apos;
        bPos = { x: apos.x + D * Math.cos(outDir), y: apos.y + D * Math.sin(outDir) };
      } else {
        bPos = apos;
        aPos = { x: apos.x + D * Math.cos(outDir), y: apos.y + D * Math.sin(outDir) };
      }
      center = { x: (aPos.x + bPos.x) / 2, y: (aPos.y + bPos.y) / 2 };
    }

    const gidA = ofdToGroup.get(poleA);
    const gidB = ofdToGroup.get(poleB);
    if (gidA && !positions.has(gidA)) positions.set(gidA, aPos);
    if (gidB && !positions.has(gidB)) positions.set(gidB, bPos);
    if (gidA) nodeRingCenter.set(gidA, center);
    if (gidB) nodeRingCenter.set(gidB, center);

    // axis vector & perp
    const dx = bPos.x - aPos.x;
    const dy = bPos.y - aPos.y;
    const axisLen = Math.hypot(dx, dy);
    const ux = dx / axisLen;
    const uy = dy / axisLen;
    // perp (좌측)
    const px = -uy;
    const py = ux;

    // Arc path (내부 노드 있음) 만 apex 분배 대상. Direct edge (length 0) 는 두 pole 사이
    // 그냥 직선 — apex offset 무관 (배치할 내부 노드 없음). 따라서 arcs.length(=M) 만으로
    // 대칭 분배. 이렇게 하면 K = M+D (D = direct count) 의 D 값에 관계없이 *항상 대칭*.
    //   M=2 → ±0.5·H_STEP  (EC9: B, D 양쪽)
    //   M=3 → −H_STEP, 0, +H_STEP
    //   M=4 → ±0.5H_STEP, ±1.5H_STEP  (EC3: 4 path 대칭)
    const arcs = block.paths.filter((p) => p.length > 0);
    const M = arcs.length;
    arcs.forEach((path, m) => {
      const apexOffset = M > 1 ? (m - (M - 1) / 2) * H_STEP : 0;
      const L = path.length;
      for (let i = 0; i < L; i++) {
        const t = (i + 1) / (L + 1);
        // parabolic arc: t=0,1 → offset 0; t=0.5 → offset=apexOffset
        const offset = 4 * apexOffset * t * (1 - t);
        const x = aPos.x + dx * t + px * offset;
        const y = aPos.y + dy * t + py * offset;
        const gid = ofdToGroup.get(path[i]);
        if (gid && !positions.has(gid)) positions.set(gid, { x, y });
        if (gid) nodeRingCenter.set(gid, center);
      }
    });
    // Direct edge (length 0) 는 React Flow 가 두 pole 사이 자동 직선으로 그림. 위치 계산 불필요.
  }

  // ─── 7. R-block (Tutte's barycentric embedding) ────────────────────────
  function placeR(block: BlockR, anchorOFD: string | null, anchorAngle: number) {
    const outer = block.outerOFDs;
    const N = outer.length;
    const R = ringRadius(N);
    // 외곽 face = 정 N-각형
    let cx: number;
    let cy: number;
    let outerStartIdx = 0;
    if (anchorOFD === null) {
      cx = 0;
      cy = 0;
    } else {
      const a = positions.get(ofdToGroup.get(anchorOFD)!)!;
      cx = a.x - R * Math.cos(anchorAngle);
      cy = a.y - R * Math.sin(anchorAngle);
      outerStartIdx = outer.findIndex((n) => n === anchorOFD);
      if (outerStartIdx < 0) outerStartIdx = 0;
    }
    for (let i = 0; i < N; i++) {
      const ofd = outer[i];
      const gid = ofdToGroup.get(ofd);
      if (!gid) continue;
      if (!positions.has(gid)) {
        const offset = (i - outerStartIdx + N) % N;
        const angle = anchorAngle + offset * ((2 * Math.PI) / N);
        positions.set(gid, { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) });
      }
      nodeRingCenter.set(gid, { x: cx, y: cy });
    }

    // 내부 vertex: Gauss-Seidel iteration — pos = avg(neighbors)
    //   외곽은 fix, 내부만 update. 30 iter 면 수렴 (Tutte 정리).
    if (block.innerOFDs.length === 0) return;

    // 초기 위치: block 중심
    for (const ofd of block.innerOFDs) {
      const gid = ofdToGroup.get(ofd);
      if (gid && !positions.has(gid)) {
        positions.set(gid, { x: cx, y: cy });
        nodeRingCenter.set(gid, { x: cx, y: cy });
      }
    }

    for (let iter = 0; iter < 50; iter++) {
      for (const ofd of block.innerOFDs) {
        const gid = ofdToGroup.get(ofd);
        if (!gid) continue;
        const nbrs = block.adj.get(ofd);
        if (!nbrs || nbrs.size === 0) continue;
        let sumX = 0;
        let sumY = 0;
        let count = 0;
        for (const nbr of nbrs) {
          const ngid = ofdToGroup.get(nbr);
          if (!ngid) continue;
          const np = positions.get(ngid);
          if (!np) continue;
          sumX += np.x;
          sumY += np.y;
          count++;
        }
        if (count > 0) positions.set(gid, { x: sumX / count, y: sumY / count });
      }
    }
  }

  // ─── 8. Root block 선택 + 배치 시작 ──────────────────────────────────
  if (blocks.length > 0) {
    let rootIdx = 0;
    let rootScore = -1;
    blocks.forEach((b, i) => {
      const members = blockMembers(b);
      let score = 0;
      for (const m of members) {
        if ((ofdBlocks.get(m)?.length ?? 0) >= 2) score += 1000; // cut vertex
      }
      score += members.size;
      if (score > rootScore) {
        rootIdx = i;
        rootScore = score;
      }
    });
    placeBlock(rootIdx, null, 0);
  }

  // ─── 9. BFS for leaves (ring 밖에 매달린 비-block 노드) ────────────────
  const fpAdjGroup = new Map<string, Set<string>>();
  for (const e of edges) {
    if (e.type !== 'fiberPath') continue;
    const s = ofdToGroup.get(e.sourceAssetId);
    const t = ofdToGroup.get(e.targetAssetId);
    if (!s || !t || s === t) continue;
    if (!fpAdjGroup.has(s)) fpAdjGroup.set(s, new Set());
    if (!fpAdjGroup.has(t)) fpAdjGroup.set(t, new Set());
    fpAdjGroup.get(s)!.add(t);
    fpAdjGroup.get(t)!.add(s);
  }
  const queue: { node: string; from: string }[] = [];
  for (const p of positions.keys()) {
    for (const n of fpAdjGroup.get(p) ?? []) {
      if (!positions.has(n)) queue.push({ node: n, from: p });
    }
  }
  let qhead = 0;
  while (qhead < queue.length) {
    const item = queue[qhead++];
    if (positions.has(item.node)) continue;
    const fromPos = positions.get(item.from)!;
    const center = nodeRingCenter.get(item.from) ?? { x: 0, y: 0 };
    const outDir = Math.atan2(fromPos.y - center.y, fromPos.x - center.x);
    const pos = { x: fromPos.x + LEAF_GAP * Math.cos(outDir), y: fromPos.y + LEAF_GAP * Math.sin(outDir) };
    positions.set(item.node, pos);
    nodeRingCenter.set(item.node, { x: fromPos.x - LEAF_GAP * Math.cos(outDir), y: fromPos.y - LEAF_GAP * Math.sin(outDir) });
    for (const n of fpAdjGroup.get(item.node) ?? []) {
      if (!positions.has(n)) queue.push({ node: n, from: item.node });
    }
  }

  // ─── 10. 미배치 노드 fallback — MIN_NODE_DISTANCE grid ────────────────
  let s = 0;
  for (const id of nodeIds) {
    if (positions.has(id)) continue;
    positions.set(id, {
      x: -1500 + (s % 5) * MIN_NODE_DISTANCE,
      y: -800 + Math.floor(s / 5) * MIN_NODE_DISTANCE,
    });
    s++;
  }
  return resolveOverlap(positions);
}

// ─── helper: 2-vertex cut 검색 (P-node poles 결정) ─────────────────────
//   block 의 모든 pair (u, v) 에 대해 둘을 제거했을 때 disconnected 인지 확인.
//   첫 번째 발견되는 pair 반환. O(V² · (V+E)).
function findTwoVertexCut(
  block: Set<string>,
  adj: Map<string, Set<string>>,
): [string, string] | null {
  const nodes = [...block];
  const targetSize = nodes.length - 2;
  if (targetSize < 1) return null;
  for (let i = 0; i < nodes.length; i++) {
    const ri = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const rj = nodes[j];
      let start: string | undefined;
      for (const n of nodes) if (n !== ri && n !== rj) { start = n; break; }
      if (!start) continue;
      const visited = new Set<string>([start]);
      const queue: string[] = [start];
      let head = 0;
      while (head < queue.length) {
        const cur = queue[head++];
        for (const nbr of adj.get(cur) ?? []) {
          if (nbr === ri || nbr === rj || visited.has(nbr) || !block.has(nbr)) continue;
          visited.add(nbr);
          queue.push(nbr);
        }
      }
      if (visited.size < targetSize) return [ri, rj];
    }
  }
  return null;
}

// ─── helper: poles 제거 후 component 별로 path 추출 ───────────────────
//   각 component 가 poles 두 vertex 에 모두 연결되어야 path 자격.
//   poles 사이 직접 edge 가 있으면 빈 path (length 0) 추가.
function extractPaths(
  block: Set<string>,
  adj: Map<string, Set<string>>,
  poles: [string, string],
): string[][] {
  const [u, v] = poles;
  const removed = new Set([u, v]);
  const seen = new Set<string>(removed);
  const paths: string[][] = [];

  for (const n of block) {
    if (seen.has(n)) continue;
    // BFS to collect component + detect u/v connection in single pass
    const comp = new Set<string>([n]);
    seen.add(n);
    let connectsU = false;
    let connectsV = false;
    let startV: string | null = null;
    const queue: string[] = [n];
    let qhead = 0;
    while (qhead < queue.length) {
      const cur = queue[qhead++];
      const nbrs = adj.get(cur);
      if (nbrs) {
        if (nbrs.has(u)) { connectsU = true; if (!startV) startV = cur; }
        if (nbrs.has(v)) connectsV = true;
      }
      for (const nbr of nbrs ?? []) {
        if (removed.has(nbr) || seen.has(nbr) || !block.has(nbr)) continue;
        comp.add(nbr);
        seen.add(nbr);
        queue.push(nbr);
      }
    }
    if (!connectsU || !connectsV || !startV) continue;
    // u-adjacent vertex → v-adjacent vertex path via BFS within component
    const parent = new Map<string, string | null>();
    parent.set(startV, null);
    const bfs: string[] = [startV];
    let bhead = 0;
    let endV: string | null = null;
    while (bhead < bfs.length) {
      const cur = bfs[bhead++];
      if (cur !== startV && (adj.get(cur)?.has(v) ?? false)) { endV = cur; break; }
      for (const nbr of adj.get(cur) ?? []) {
        if (!comp.has(nbr) || parent.has(nbr)) continue;
        parent.set(nbr, cur);
        bfs.push(nbr);
      }
    }
    if (endV === null && (adj.get(startV)?.has(v) ?? false)) endV = startV;
    if (endV) {
      const path: string[] = [];
      let c: string | null | undefined = endV;
      while (c !== null && c !== undefined) {
        path.unshift(c);
        c = parent.get(c) ?? null;
      }
      paths.push(path);
    }
  }

  // 직접 edge u-v 가 있으면 빈 path (length 0) 추가. 순서는 임의 — placeP 가
  // arc path 와 direct edge 를 분리해서 apex 분배하므로 순서 무관.
  if ((adj.get(u) ?? new Set()).has(v)) paths.push([]);

  return paths;
}

// ─── helper: block 의 모든 OFD 멤버 (set) ───────────────────────────────
function blockMembers(b: Block): Set<string> {
  if (b.kind === 'S') return new Set(b.cyclicOFDs);
  if (b.kind === 'P') {
    const s = new Set<string>(b.poles);
    for (const p of b.paths) for (const n of p) s.add(n);
    return s;
  }
  // R
  const s = new Set<string>(b.outerOFDs);
  for (const n of b.innerOFDs) s.add(n);
  return s;
}

