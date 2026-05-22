/**
 * BC-tree composition layout — 그래프 그리기 학계 표준 합성 알고리즘.
 *
 * 각 level-0 ring 을 정다각형으로 그리고, cut vertex 로 공유된 ring 끼리는 그 점에서 **tangent**
 * 로 배치. 비-ring 인접 edge (bridge / leaf chain) 은 ring 의 외측 방향으로 fan-out.
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
  const ringById = new Map(fundamental.map((r) => [r.id, r] as const));

  // 그룹-그룹 FP adjacency (bridge / leaf 탐색용).
  const fpAdj = new Map<string, Set<string>>();
  for (const e of edges) {
    if (e.type !== 'fiberPath') continue;
    const src = ofdToGroup.get(e.sourceEquipmentId);
    const tgt = ofdToGroup.get(e.targetEquipmentId);
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

      // bridge 방향: ring 1개뿐이면 2π/(1+bridges) 균등; 아니면 ring 사이 gap 중앙.
      const bridgeStep = ringCount === 1 ? (2 * Math.PI) / (1 + bridges.length) : ringStep;
      bridges.forEach((brNode, idx) => {
        const outDir =
          ringCount === 1
            ? dirToCurrentCenter + (idx + 1) * bridgeStep
            : dirToCurrentCenter + ((idx % ringCount) + 0.5) * ringStep;
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
          // bridge → leaf. 외측 방향으로 단순 배치, 체인은 다음 단계에서 BFS 로 처리.
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

  // ─── BFS: 남은 leaf 체인 (이미 일부 leaf 는 placeRing 안에서 placement
  //     되었지만, 그 leaf 의 *추가* neighbor 는 처리 안 됨) ────────────────
  const queue: { node: string; from: string }[] = [];
  for (const p of positions.keys()) {
    for (const nbr of fpAdj.get(p) ?? []) {
      if (!positions.has(nbr)) queue.push({ node: nbr, from: p });
    }
  }
  let qhead = 0;
  while (qhead < queue.length) {
    const item = queue[qhead++];
    if (positions.has(item.node)) continue;
    const fromPos = positions.get(item.from)!;
    const outDir = outwardDir(item.from);
    const pos = {
      x: fromPos.x + LEAF_GAP * Math.cos(outDir),
      y: fromPos.y + LEAF_GAP * Math.sin(outDir),
    };
    positions.set(item.node, pos);
    nodeRingCenter.set(item.node, {
      x: fromPos.x - LEAF_GAP * Math.cos(outDir),
      y: fromPos.y - LEAF_GAP * Math.sin(outDir),
    });
    for (const nbr of fpAdj.get(item.node) ?? []) {
      if (!positions.has(nbr)) queue.push({ node: nbr, from: item.node });
    }
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

  // ─── 최종 fallback: 모든 미배치 노드 (ring 없는 순수 tree/chain 등) ────
  //   MIN_NODE_DISTANCE 간격 grid — resolveOverlap scale 안 타도록.
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
