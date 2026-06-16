/**
 * BC-tree composition layout — 그래프 그리기 학계 표준 합성 알고리즘.
 *
 * 각 level-0 ring 을 정다각형으로 그리고, cut vertex 로 공유된 ring 끼리는 그 점에서 **tangent**
 * 로 배치. ring 이 아닌 부분(bridge 로 이어진 트리)은 size-aware radial tree 로 배치 —
 * 자식 서브트리의 leaf 수에 비례해 sector 를 나눠 edge 가 다른 노드를 관통하지 않는다.
 * 순수 트리(ring 0개)도 같은 함수로 처리 (BC-tree 의 degenerate 케이스).
 *
 * → 모든 ring edge 길이 = 2R sin(π/N) 동일.
 * → 한 점에서 K 개 branch (ring + bridge) 가 만나면 360°/K 등분.
 * → 매개변수 0개 (closed-form geometry).
 *
 * 가정: 그래프가 BC-tree 구조 (level-0 ring 들이 cut vertex 로만 공유). Level-1 composite ring
 * (edges-sharing) 은 SPQR-tree 가 필요 — 지금은 미지원.
 *
 * Reference:
 *  - OGDF BCTree class (Brown handbook, Chimani)
 *  - "Smashing Peacocks Further" — drawing quasi-trees from biconnected components
 */

import type { TraceEdge, TraceRing } from '../../pathTrace/types';
import { toMapById } from '../../../utils/byId';
import { BRIDGE_GAP, LEAF_GAP, MIN_NODE_DISTANCE, resolveOverlap, ringRadius } from './geometry';

export interface BCTreeLayoutInput {
  nodeIds: string[];
  ofdToGroup: Map<string, string>;
  edges: TraceEdge[];
  rings: TraceRing[];
}

export function computeLayoutBCTree(input: BCTreeLayoutInput): Map<string, { x: number; y: number }> {
  const { nodeIds, ofdToGroup, edges, rings } = input;
  const positions = new Map<string, { x: number; y: number }>();
  const nodeRingCenter = new Map<string, { x: number; y: number }>(); // groupId → 소속 ring 중심 (외측 방향 계산용)

  const fundamental = rings.filter((r) => r.level === 0);

  // ─── 인접/멤버십 인덱스 ───────────────────────────────────────────────
  const memberRings = new Map<string, string[]>(); // groupId → 속한 ring id 들
  for (const ring of fundamental) {
    for (const nid of ring.nodeIds) {
      const gid = ofdToGroup.get(nid);
      if (!gid) continue;
      if (!memberRings.has(gid)) memberRings.set(gid, []);
      memberRings.get(gid)!.push(ring.id);
    }
  }
  const ringById = toMapById(fundamental);

  // 그룹-그룹 FP adjacency (bridge / leaf 탐색용).
  const fpAdj = new Map<string, Set<string>>();
  for (const e of edges) {
    if (e.type !== 'fiberPath') continue;
    const src = ofdToGroup.get(e.sourceAssetId);
    const tgt = ofdToGroup.get(e.targetAssetId);
    if (!src || !tgt || src === tgt) continue;
    if (!fpAdj.has(src)) fpAdj.set(src, new Set());
    if (!fpAdj.has(tgt)) fpAdj.set(tgt, new Set());
    fpAdj.get(src)!.add(tgt);
    fpAdj.get(tgt)!.add(src);
  }

  const placed = new Set<string>();
  // junction (= 여러 ring/bridge 의 만남) 한 번씩만 fan-out.
  //   첫 번째 ring 이 K-way 균등 분배 → 그 결과대로 ring/bridge 들 배치.
  //   subsequent ring 이 같은 junction 재진입하면 skip (이미 fan-out 됨).
  const fannedOut = new Set<string>();

  // ─── 노드 N 의 outward 방향 (소속 ring 중심에서 N 을 보는 각도) ────────
  function outwardDir(gid: string): number {
    const p = positions.get(gid);
    const c = nodeRingCenter.get(gid);
    if (!p || !c) return 0;
    return Math.atan2(p.y - c.y, p.x - c.x);
  }

  // ─── ring 배치 (cut-vertex + bridge fan-out 통합) ──────────────────────
  function placeRing(ring: TraceRing, anchorGroupId: string | null, anchorAngle: number) {
    if (placed.has(ring.id)) return;
    placed.add(ring.id);

    const N = ring.nodeIds.length;
    const R = ringRadius(N);

    let cx: number;
    let cy: number;
    let anchorIdx = 0;
    if (anchorGroupId === null) {
      cx = 0;
      cy = 0;
    } else {
      const a = positions.get(anchorGroupId)!;
      cx = a.x - R * Math.cos(anchorAngle);
      cy = a.y - R * Math.sin(anchorAngle);
      anchorIdx = ring.nodeIds.findIndex((nid) => ofdToGroup.get(nid) === anchorGroupId);
      if (anchorIdx < 0) anchorIdx = 0;
    }

    // 멤버 배치 (cyclic CCW, 균등 각도).
    for (let i = 0; i < N; i++) {
      const gid = ofdToGroup.get(ring.nodeIds[i]);
      if (!gid) continue;
      if (!positions.has(gid)) {
        const offset = (i - anchorIdx + N) % N;
        const angle = anchorAngle + offset * ((2 * Math.PI) / N);
        positions.set(gid, { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) });
      }
      nodeRingCenter.set(gid, { x: cx, y: cy });
    }

    // junction & bridge 재귀.
    //   Ring 은 우선 균등 분배 (2π/ringCount) — edge 삭제로 ring 이 bridge 로 바뀌어도 남은
    //   ring 들은 넓게 (2 ring → figure-8). Bridge 는 ring 사이 gap 중앙에 끼움.
    //   각 junction 은 *한 번만* fan-out (첫 도착 ring 이 분배).
    for (let i = 0; i < N; i++) {
      const gid = ofdToGroup.get(ring.nodeIds[i]);
      if (!gid) continue;
      if (fannedOut.has(gid)) continue;

      // outgoing ring (cut vertex)
      const outgoingRings = (memberRings.get(gid) ?? []).filter((rid) => !placed.has(rid));
      const outgoingRingSet = new Set(outgoingRings);
      // bridge: 이 ring 멤버 외부로 가는 FP edge — *outgoing ring 의 멤버는 제외*
      //   (outgoing ring 의 placeRing 이 곧 그 멤버를 cyclic 으로 배치할 예정).
      //   bridge 후보: (a) 다른 unplaced ring (= outgoingRing 이 아닌) 의 멤버 또는 (b) 어떤 ring 에도 안 속하는 leaf.
      const bridges: string[] = [];
      for (const nbr of fpAdj.get(gid) ?? []) {
        if (positions.has(nbr)) continue;
        const nbrRings = memberRings.get(nbr) ?? [];
        if (nbrRings.some((rid) => outgoingRingSet.has(rid))) continue; // outgoing ring 으로 곧 처리됨 → skip
        if (nbrRings.some((rid) => placed.has(rid))) continue;
        bridges.push(nbr);
      }
      if (outgoingRings.length === 0 && bridges.length === 0) continue;
      fannedOut.add(gid);

      const jp = positions.get(gid)!;
      const dirToCurrentCenter = Math.atan2(cy - jp.y, cx - jp.x); // J → 현재 ring 중심
      const ringCount = 1 + outgoingRings.length; // 현재 ring + outgoing rings
      const ringStep = (2 * Math.PI) / ringCount;

      outgoingRings.forEach((adjId, idx) => {
        const adjRing = ringById.get(adjId);
        if (adjRing) {
          const outDir = dirToCurrentCenter + (idx + 1) * ringStep;
          placeRing(adjRing, gid, outDir + Math.PI);
        }
      });

      // bridge 방향: ring 1개뿐이면 2π/(1+bridges) 균등; 아니면 ring 사이 gap 에 분산.
      // ringCount>1 일 때 같은 gap(idx%ringCount)에 여러 bridge 가 와도 그 안에서 (k+1)/(m+1)
      // 로 균등 분산 → *정확히 겹치는*(modulo 충돌) 문제를 없앤다. gap 당 1개면 frac=0.5 라
      // 기존((g+0.5)*ringStep)과 완전히 동일 — 정상 케이스 동작 불변.
      const bridgeStep = ringCount === 1 ? (2 * Math.PI) / (1 + bridges.length) : ringStep;
      const bridgeDirs: number[] = [];
      if (ringCount === 1) {
        bridges.forEach((_, idx) => bridgeDirs.push(dirToCurrentCenter + (idx + 1) * bridgeStep));
      } else {
        const gapTotal = new Map<number, number>();
        for (let idx = 0; idx < bridges.length; idx++) {
          const g = idx % ringCount;
          gapTotal.set(g, (gapTotal.get(g) ?? 0) + 1);
        }
        const gapSeen = new Map<number, number>();
        for (let idx = 0; idx < bridges.length; idx++) {
          const g = idx % ringCount;
          const k = gapSeen.get(g) ?? 0;
          gapSeen.set(g, k + 1);
          const frac = (k + 1) / (gapTotal.get(g)! + 1);
          bridgeDirs.push(dirToCurrentCenter + (g + frac) * ringStep);
        }
      }
      bridges.forEach((brNode, idx) => {
        const outDir = bridgeDirs[idx];
        const nbrRings = memberRings.get(brNode) ?? [];
        const targetRingId = nbrRings.find((rid) => !placed.has(rid));
        if (targetRingId) {
          // bridge → 다른 ring 의 멤버. 그 ring 을 tangent 로 배치.
          const targetRing = ringById.get(targetRingId)!;
          positions.set(brNode, {
            x: jp.x + BRIDGE_GAP * Math.cos(outDir),
            y: jp.y + BRIDGE_GAP * Math.sin(outDir),
          });
          placeRing(targetRing, brNode, outDir + Math.PI);
        } else {
          // bridge → leaf. 외측 방향으로 단순 배치 — 이어지는 체인은 아래 트리 레이아웃이 처리.
          positions.set(brNode, {
            x: jp.x + LEAF_GAP * Math.cos(outDir),
            y: jp.y + LEAF_GAP * Math.sin(outDir),
          });
          // 다음 leaf 가 같은 방향 이어가도록 가상 ring 중심을 leaf 뒤쪽에 둠.
          nodeRingCenter.set(brNode, {
            x: jp.x - LEAF_GAP * Math.cos(outDir),
            y: jp.y - LEAF_GAP * Math.sin(outDir),
          });
        }
      });
    }
  }

  // ─── root 선택 (junction 가장 많은 ring; 동률이면 멤버 수) ─────────────
  if (fundamental.length > 0) {
    let root = fundamental[0];
    let rootScore = -1;
    for (const ring of fundamental) {
      let s = 0;
      for (const nid of ring.nodeIds) {
        const gid = ofdToGroup.get(nid);
        if (gid && (memberRings.get(gid)?.length ?? 0) >= 2) s += 1000;
      }
      s += ring.nodeIds.length;
      if (s > rootScore) {
        root = ring;
        rootScore = s;
      }
    }
    placeRing(root, null, 0);
  }

  // ─── 분리된 ring component (placed 안 된 ring) — 우측으로 offset ────────
  let detachedOffset = 1500;
  for (const ring of fundamental) {
    if (placed.has(ring.id)) continue;
    const N = ring.nodeIds.length;
    const R = ringRadius(N);
    for (let i = 0; i < N; i++) {
      const gid = ofdToGroup.get(ring.nodeIds[i]);
      if (!gid || positions.has(gid)) continue;
      const angle = (i * 2 * Math.PI) / N;
      positions.set(gid, { x: detachedOffset + R * Math.cos(angle), y: R * Math.sin(angle) });
      nodeRingCenter.set(gid, { x: detachedOffset, y: 0 });
    }
    placed.add(ring.id);
    detachedOffset += 2 * R + 300;
  }

  // ─── 트리(bridge 블록) 레이아웃 — BC-tree 에서 ring 이 아닌 모든 부분 ─────
  //   ring 은 위에서 다각형으로 배치됐다. 남은 노드는 전부 bridge 로 이어진
  //   트리. size-aware radial tree 로 배치한다:
  //     · 자식 서브트리의 leaf 수에 비례해 각도 sector 분배 → 서브트리 겹침 없음
  //     · depth 가 1 차이 나는 노드끼리만 edge → edge 가 다른 노드를 관통 불가
  //   순수 트리(ring 0개)든 ring 에 매달린 트리든 같은 함수로 처리.
  const treeSet = new Set<string>(nodeIds.filter((id) => !positions.has(id)));
  if (treeSet.size > 0) {
    // 서브트리 leaf 수 (parent 방향 제외) — sector 분배 가중치.
    //   treeSet 은 forest 가 보장됨 (모든 cycle 은 ring 으로 이미 배치).
    const weightMemo = new Map<string, number>();
    const leafWeight = (node: string, parent: string | null): number => {
      const key = `${node}|${parent}`;
      const cached = weightMemo.get(key);
      if (cached !== undefined) return cached;
      const kids = [...(fpAdj.get(node) ?? [])].filter((n) => n !== parent && treeSet.has(n));
      const w = kids.length === 0 ? 1 : kids.reduce((sum, k) => sum + leafWeight(k, node), 0);
      weightMemo.set(key, w);
      return w;
    };

    // node(배치 완료)의 미배치 트리-이웃을 [wLo, wHi] wedge 에 부채꼴 배치 후 재귀.
    const growTree = (node: string, parent: string | null, wLo: number, wHi: number): void => {
      const np = positions.get(node)!;
      const kids = [...(fpAdj.get(node) ?? [])].filter(
        (n) => n !== parent && treeSet.has(n) && !positions.has(n),
      );
      if (kids.length === 0) return;
      const weights = kids.map((k) => leafWeight(k, node));
      const total = weights.reduce((a, b) => a + b, 0);
      let acc = wLo;
      kids.forEach((k, i) => {
        const span = ((wHi - wLo) * weights[i]) / total;
        const dir = acc + span / 2;
        positions.set(k, {
          x: np.x + MIN_NODE_DISTANCE * Math.cos(dir),
          y: np.y + MIN_NODE_DISTANCE * Math.sin(dir),
        });
        growTree(k, node, acc, acc + span);
        acc += span;
      });
    };

    // (a) ring 으로 이미 배치된 노드(anchor)에 매달린 트리 — 바깥 방향 180° wedge.
    for (const anchor of [...positions.keys()]) {
      const center = outwardDir(anchor);
      growTree(anchor, null, center - Math.PI / 2, center + Math.PI / 2);
    }

    // (b) ring 과 무관한 자유 트리 (순수 트리 케이스) — centroid 를 root 로 360° 배치.
    let freeX = positions.size > 0 ? detachedOffset : 0;
    for (const seed of treeSet) {
      if (positions.has(seed)) continue;
      // seed 가 속한 컴포넌트 수집 (treeSet 내부).
      const comp: string[] = [];
      const seen = new Set<string>([seed]);
      const stack = [seed];
      while (stack.length > 0) {
        const n = stack.pop()!;
        comp.push(n);
        for (const m of fpAdj.get(n) ?? []) {
          if (treeSet.has(m) && !seen.has(m)) {
            seen.add(m);
            stack.push(m);
          }
        }
      }
      // tree centroid — leaf 를 반복 제거해 1~2 노드 남김 (트리 높이 최소화).
      const deg = new Map<string, number>(
        comp.map((n) => [n, [...(fpAdj.get(n) ?? [])].filter((x) => treeSet.has(x)).length]),
      );
      let remaining = comp.length;
      let layer = comp.filter((n) => (deg.get(n) ?? 0) <= 1);
      const peeled = new Set<string>();
      while (remaining > 2 && layer.length > 0) {
        const next: string[] = [];
        for (const lf of layer) {
          peeled.add(lf);
          remaining--;
          for (const nbr of fpAdj.get(lf) ?? []) {
            if (!treeSet.has(nbr) || peeled.has(nbr)) continue;
            const d = (deg.get(nbr) ?? 0) - 1;
            deg.set(nbr, d);
            if (d === 1) next.push(nbr);
          }
        }
        layer = next;
      }
      const root = layer[0] ?? comp[0];
      positions.set(root, { x: freeX, y: 0 });
      growTree(root, null, 0, 2 * Math.PI);
      let maxX = freeX;
      for (const n of comp) maxX = Math.max(maxX, positions.get(n)?.x ?? freeX);
      freeX = maxX + 2 * MIN_NODE_DISTANCE;
    }
  }

  return resolveOverlap(positions);
}
