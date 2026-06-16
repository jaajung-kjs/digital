import { cableTrace } from './cableTrace';
import type { TraceGraph } from './traceGraph';
import { detectRings } from '../../utils/graph/cycleDetection';
import type { TraceNode, TraceEdge, TraceRing } from '../pathTrace/types';

export interface TraceStep { id: string; label: string; isEndpoint: boolean; isFiberEdge: boolean }
/** 경로 트리 노드 — 분배(통과설비 fan-out)를 분기로 표현. 선형 경로면 자식 1개 체인. */
export interface TraceTreeNode {
  id: string;
  label: string;
  isEndpoint: boolean;   // 루트(출발) 또는 말단(leaf)
  isFiberEdge: boolean;  // 부모→이 노드 들어오는 엣지가 OPGW(IN-IN)
  children: TraceTreeNode[];
}
export interface TraceProjection {
  seedCableId: string;
  nodeIds: string[];
  cableIds: string[];
  steps: TraceStep[];
  tree: TraceTreeNode | null;
  nodes: TraceNode[];
  edges: TraceEdge[];
  rings: TraceRing[];
  seedFiberEdgeId: string | null;
  truncated: boolean;
}

type CableLike = TraceGraph['cables'][number];
const isOpgw = (c: CableLike) => c.sourceRole === 'IN' && c.targetRole === 'IN';

export function projectTrace(seedCableId: string, graph: TraceGraph): TraceProjection | null {
  const cableById = new Map(graph.cables.map((c) => [c.id, c]));
  const seed = cableById.get(seedCableId);
  if (!seed) return null;
  const kindById = new Map(graph.assets.map((a) => [a.id, a.connectionKind ?? null]));
  const kindOf = (id: string | null | undefined) => (id ? (kindById.get(id) ?? null) : null);

  const src = seed.sourceAssetId ?? null;
  const tgt = seed.targetAssetId ?? null;
  // 전제조건: 시드는 설비에 닿는 케이블(OUT/일반)이어야 한다 — start 가 passive(설비) 노드면
  // cableTrace 의 conduit 채널짝이 끝까지 이어진다. 시드가 OPGW(양끝 conduit 슬롯)면 start 가
  // conduit 로 떨어져 채널 미정 → 부분 경로(그 슬롯에 직결된 것까지)만 나온다. 단, 현재 UI 는
  // OPGW 를 클릭-트레이스 시드로 노출하지 않는다(선번장 행=OUT 코어 케이블, OPGW 는 미배치 슬롯
  // 간 트렁크라 도면 미표시). 트렁크 트레이스는 단일 코어 개념이 없어 의미가 모호하므로 그대로 둔다.
  const start = kindOf(src) === null ? src : kindOf(tgt) === null ? tgt : src;
  if (!start) return null;
  const cableType = seed.cableType ?? 'FIBER';

  const tr = cableTrace(start, cableType, graph.assets, graph.cables);
  const tracedCables = tr.cableIds.map((id) => cableById.get(id)).filter((c): c is CableLike => !!c);

  // 코어번호 K: 시드 number, 없으면 트레이스 내 OUT 케이블의 number
  const K = seed.number ?? tracedCables.find((c) => c.sourceRole === 'OUT' || c.targetRole === 'OUT')?.number ?? null;

  // collapse: conduit(슬롯)→부모 OFD. parentById 가 null/미설정인 고아 슬롯이면 슬롯 자신을 유지
  // (현재 데이터 불변식상 모든 슬롯은 OFD 부모를 가짐 — 고아는 미발생). s===t 엣지는 아래서 스킵.
  const collapse = (id: string | null | undefined): string | null => {
    if (!id) return null;
    if (kindOf(id) === 'conduit') return graph.parentById.get(id) ?? id;
    return id;
  };

  // ── 토폴로지 nodes ──
  const nodeById = new Map<string, TraceNode>();
  for (const raw of tr.nodeIds) {
    const id = collapse(raw);
    if (!id || nodeById.has(id)) continue;
    const code = graph.codeById.get(id) ?? null;
    nodeById.set(id, {
      nodeId: id,
      nodeName: graph.nameById.get(id) ?? id,
      substationName: graph.subNameById.get(id) ?? '',
      substationId: '',
      floorId: null,
      materialCategoryCode: code === 'OFD' ? 'EQP-OFD' : null,
      isSource: collapse(start) === id,
      isTarget: false,
    });
  }

  // ── 토폴로지 edges ──
  const edges: TraceEdge[] = [];
  let seedFiberEdgeId: string | null = isOpgw(seed) ? seed.id : null;
  const seedEnds = new Set([seed.sourceAssetId, seed.targetAssetId].filter(Boolean) as string[]);
  for (const c of tracedCables) {
    const s = collapse(c.sourceAssetId);
    const t = collapse(c.targetAssetId);
    if (!s || !t || s === t) continue;
    if (isOpgw(c)) {
      edges.push({ id: c.id, sourceAssetId: s, targetAssetId: t, type: 'fiberPath', fiberPathId: c.id, fiberPortNumber: K ?? undefined });
      // 시드가 OUT 이면 그 슬롯 끝점을 공유하는 OPGW 를 seed 광edge 로. 슬롯당 OPGW 는 1개라는
      // 불변식(P4 마이그레이션)상 유일 매칭. (워킹/예비 쌍처럼 슬롯당 OPGW 2개가 생기면 순회 첫
      // 매칭이 선택됨 — 현재 모델엔 없음.)
      if (!seedFiberEdgeId && (seedEnds.has(c.sourceAssetId ?? '') || seedEnds.has(c.targetAssetId ?? ''))) seedFiberEdgeId = c.id;
    } else {
      edges.push({ id: c.id, sourceAssetId: s, targetAssetId: t, type: 'cable' });
    }
  }

  // ── rings (광 edge 만) ──
  const fiberEdges = edges.filter((e) => e.type === 'fiberPath');
  const adjacency = new Map<string, Set<string>>();
  const edgeMap = new Map<string, TraceEdge>();
  for (const e of fiberEdges) {
    edgeMap.set(e.id, e);
    if (!adjacency.has(e.sourceAssetId)) adjacency.set(e.sourceAssetId, new Set());
    if (!adjacency.has(e.targetAssetId)) adjacency.set(e.targetAssetId, new Set());
    adjacency.get(e.sourceAssetId)!.add(e.targetAssetId);
    adjacency.get(e.targetAssetId)!.add(e.sourceAssetId);
  }
  const rings = detectRings(adjacency, edgeMap, nodeById);

  const steps = buildSteps(start, tr.nodeIds, tracedCables, graph, collapse);
  const tree = buildTree(start, tr.nodeIds, tracedCables, graph, collapse);

  return {
    seedCableId, nodeIds: tr.nodeIds, cableIds: tr.cableIds,
    steps, tree, nodes: [...nodeById.values()], edges, rings, seedFiberEdgeId, truncated: !!tr.truncated,
  };
}

/**
 * 경로 트리 — start 에서 BFS 트리(back-edge 제거). conduit 슬롯은 부모 OFD 로 접고,
 * 접혀서 부모와 같은 노드가 되면 손주를 끌어올려 중복을 없앤다. 분배(통과설비 fan-out)는
 * 자식 2개↑ 분기로, 선형 경로는 자식 1개 체인으로 표현.
 */
function buildTree(
  start: string,
  nodeIds: string[],
  tracedCables: CableLike[],
  graph: TraceGraph,
  collapse: (id: string | null | undefined) => string | null,
): TraceTreeNode | null {
  const node = new Set(nodeIds);
  const adj = new Map<string, { to: string; cable: CableLike }[]>();
  const addAdj = (a: string, to: string, cable: CableLike) => {
    const arr = adj.get(a);
    if (arr) arr.push({ to, cable });
    else adj.set(a, [{ to, cable }]);
  };
  for (const c of tracedCables) {
    const a = c.sourceAssetId, b = c.targetAssetId;
    if (!a || !b || !node.has(a) || !node.has(b)) continue;
    addAdj(a, b, c);
    addAdj(b, a, c);
  }
  // BFS 트리 엣지(부모 1개) 수집 — back-edge 는 무시.
  const visited = new Set<string>([start]);
  const childrenRaw = new Map<string, { to: string; cable: CableLike }[]>();
  const q = [start];
  while (q.length) {
    const cur = q.shift()!;
    for (const { to, cable } of adj.get(cur) ?? []) {
      if (visited.has(to)) continue;
      visited.add(to);
      const arr = childrenRaw.get(cur);
      if (arr) arr.push({ to, cable });
      else childrenRaw.set(cur, [{ to, cable }]);
      q.push(to);
    }
  }
  const labelOf = (cid: string): string => {
    const isOfd = graph.codeById.get(cid) === 'OFD';
    return isOfd ? (graph.subNameById.get(cid) ?? graph.nameById.get(cid) ?? cid) : (graph.nameById.get(cid) ?? cid);
  };
  const build = (rawId: string, incoming: CableLike | null): TraceTreeNode | null => {
    const cid = collapse(rawId);
    if (!cid) return null;
    const isFiberEdge = !!incoming && incoming.sourceRole === 'IN' && incoming.targetRole === 'IN';
    const tn: TraceTreeNode = { id: cid, label: labelOf(cid), isEndpoint: false, isFiberEdge, children: [] };
    for (const { to, cable } of childrenRaw.get(rawId) ?? []) {
      const child = build(to, cable);
      if (!child) continue;
      if (child.id === cid) tn.children.push(...child.children); // 접힘 중복(슬롯→OFD) → 손주 승격
      else tn.children.push(child);
    }
    tn.isEndpoint = tn.children.length === 0;
    return tn;
  };
  const tree = build(start, null);
  if (tree) tree.isEndpoint = true; // 루트(출발)도 끝점 강조
  return tree;
}

function buildSteps(
  start: string,
  nodeIds: string[],
  tracedCables: CableLike[],
  graph: TraceGraph,
  collapse: (id: string | null | undefined) => string | null,
): TraceStep[] {
  const node = new Set(nodeIds);
  const adj = new Map<string, { to: string; cable: CableLike }[]>();
  const addAdj = (a: string, to: string, cable: CableLike) => {
    const arr = adj.get(a);
    if (arr) arr.push({ to, cable });
    else adj.set(a, [{ to, cable }]);
  };
  for (const c of tracedCables) {
    const a = c.sourceAssetId, b = c.targetAssetId;
    if (!a || !b || !node.has(a) || !node.has(b)) continue;
    addAdj(a, b, c);
    addAdj(b, a, c);
  }
  const parent = new Map<string, { from: string; cable: CableLike } | null>([[start, null]]);
  const q = [start];
  let far = start;
  while (q.length) {
    const cur = q.shift()!;
    far = cur;
    for (const { to, cable } of adj.get(cur) ?? []) {
      if (parent.has(to)) continue;
      parent.set(to, { from: cur, cable });
      q.push(to);
    }
  }
  const chain: { id: string; cable: CableLike | null }[] = [];
  let cur: string | null = far;
  while (cur) {
    const p: { from: string; cable: CableLike } | null = parent.get(cur) ?? null;
    chain.unshift({ id: cur, cable: p?.cable ?? null });
    cur = p?.from ?? null;
  }
  const steps: TraceStep[] = [];
  for (let i = 0; i < chain.length; i++) {
    const cid = collapse(chain[i].id);
    if (!cid) continue;
    if (steps.length && steps[steps.length - 1].id === cid) continue;
    const incoming = chain[i].cable;
    const isFiberEdge = !!incoming && incoming.sourceRole === 'IN' && incoming.targetRole === 'IN';
    const isOfd = graph.codeById.get(cid) === 'OFD';
    steps.push({
      id: cid,
      label: isOfd ? (graph.subNameById.get(cid) ?? graph.nameById.get(cid) ?? cid) : (graph.nameById.get(cid) ?? cid),
      isEndpoint: i === 0 || i === chain.length - 1,
      isFiberEdge,
    });
  }
  return steps;
}
