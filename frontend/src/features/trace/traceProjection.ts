import { cableTrace } from './cableTrace';
import type { TraceGraph } from './traceGraph';
import { detectRings } from '../../utils/graph/cycleDetection';
import type { TraceNode, TraceEdge, TraceRing } from '../pathTrace/types';

export interface TraceStep { id: string; label: string; isEndpoint: boolean; isFiberEdge: boolean }
export interface TraceProjection {
  seedCableId: string;
  nodeIds: string[];
  cableIds: string[];
  steps: TraceStep[];
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
  const start = kindOf(src) === null ? src : kindOf(tgt) === null ? tgt : src;
  if (!start) return null;
  const cableType = seed.cableType ?? 'FIBER';

  const tr = cableTrace(start, cableType, graph.assets, graph.cables);
  const tracedCables = tr.cableIds.map((id) => cableById.get(id)).filter((c): c is CableLike => !!c);

  // 코어번호 K: 시드 number, 없으면 트레이스 내 OUT 케이블의 number
  const K = seed.number ?? tracedCables.find((c) => c.sourceRole === 'OUT' || c.targetRole === 'OUT')?.number ?? null;

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

  return {
    seedCableId, nodeIds: tr.nodeIds, cableIds: tr.cableIds,
    steps, nodes: [...nodeById.values()], edges, rings, seedFiberEdgeId, truncated: !!tr.truncated,
  };
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
