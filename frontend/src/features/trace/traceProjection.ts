import { cableTrace } from './cableTrace';
import type { TraceGraph } from './traceGraph';
import { isOpgwTwin, roleAt, other } from '../cables/cableEndpoint';
import { detectRings } from '../../utils/graph/cycleDetection';
import { buildInternalPath } from '../connections/internalPath';
import type { TraceNode, TraceEdge, TraceRing } from '../pathTrace/types';

/** 그래프 노드의 OFD 판정 — role 단일 소스. */
const graphNodeIsOfd = (graph: TraceGraph, id: string): boolean =>
  graph.roleById.get(id) === 'ofd';

export interface TraceStep { id: string; label: string; isEndpoint: boolean; isFiberEdge: boolean }
/** 경로 트리 노드 — 분배(통과설비 fan-out)를 분기로 표현. 선형 경로면 자식 1개 체인. */
export interface TraceTreeNode {
  id: string;
  label: string;
  isEndpoint: boolean;   // 루트(출발) 또는 말단(leaf)
  isFiberEdge: boolean;  // 부모→이 노드 들어오는 엣지가 OPGW(IN-IN)
  cableId: string | null; // 부모→이 노드 들어오는 케이블 id (선택 케이블 위치 강조용). 루트=null
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
  /** 변전소별 내부경로 트리(설비 말단→슬롯, 내부경로 드릴다운과 동일 순서) — 토폴로지 노드 표시용. */
  internalTrees: { substationName: string; tree: TraceTreeNode }[];
  seedFiberEdgeId: string | null;
  truncated: boolean;
}

type CableLike = TraceGraph['cables'][number];

/**
 * conduit dead-end(편도) 가지치기: 대국 단말이 없어 conduit(슬롯)에서 끊긴 가지를 제거한다.
 * conduit 노드의 degree 가 ≤1 이면(코어 한쪽 or OPGW 한쪽만) 제거를 반복 → 실단말끼리 잇는
 * 경로만 남는다. 이후 고립(degree 0) 노드 제거. conduit 없는 경로(전력 등)는 영향 없음.
 */
function pruneDanglingConduits(
  nodeIds: string[],
  cableIds: string[],
  cableById: Map<string, CableLike>,
  kindOf: (id: string | null | undefined) => string | null,
): { nodeIds: string[]; cableIds: string[] } {
  const nodes = new Set(nodeIds);
  const cables = new Set(cableIds);
  const degrees = () => {
    const d = new Map<string, number>();
    for (const cid of cables) {
      const c = cableById.get(cid);
      if (!c) continue;
      for (const a of [c.sourceAssetId, c.targetAssetId]) if (a && nodes.has(a)) d.set(a, (d.get(a) ?? 0) + 1);
    }
    return d;
  };
  let changed = true;
  while (changed) {
    changed = false;
    const deg = degrees();
    for (const n of [...nodes]) {
      if (kindOf(n) === 'slot' && (deg.get(n) ?? 0) <= 1) {
        nodes.delete(n);
        for (const cid of [...cables]) {
          const c = cableById.get(cid);
          if (c && (c.sourceAssetId === n || c.targetAssetId === n)) cables.delete(cid);
        }
        changed = true;
      }
    }
  }
  const deg = degrees();
  for (const n of [...nodes]) if ((deg.get(n) ?? 0) === 0) nodes.delete(n);
  return { nodeIds: [...nodes], cableIds: [...cables] };
}

export function projectTrace(seedCableId: string, graph: TraceGraph): TraceProjection | null {
  const cableById = new Map(graph.cables.map((c) => [c.id, c]));
  const seed = cableById.get(seedCableId);
  if (!seed) return null;
  const kindOf = (id: string | null | undefined) => (id ? (graph.roleById.get(id) ?? null) : null);

  const src = seed.sourceAssetId ?? null;
  const tgt = seed.targetAssetId ?? null;
  // 전제조건: 시드는 설비에 닿는 케이블(OUT/일반)이어야 한다 — start 가 passive(설비) 노드면
  // cableTrace 의 conduit 채널짝이 끝까지 이어진다. 시드가 OPGW(양끝 conduit 슬롯)면 start 가
  // conduit 로 떨어져 채널 미정 → 부분 경로(그 슬롯에 직결된 것까지)만 나온다. 단, 현재 UI 는
  // OPGW 를 클릭-트레이스 시드로 노출하지 않는다(선번장 행=OUT 코어 케이블, OPGW 는 미배치 슬롯
  // 간 트렁크라 도면 미표시). 트렁크 트레이스는 단일 코어 개념이 없어 의미가 모호하므로 그대로 둔다.
  const start = (kindOf(src) !== 'slot' && kindOf(src) !== 'feeder') ? src : (kindOf(tgt) !== 'slot' && kindOf(tgt) !== 'feeder') ? tgt : src;
  if (!start) return null;
  const groupId = seed.groupId ?? null;

  const tr = cableTrace(start, groupId, graph.assets, graph.cables);
  // 대국 단말 없는 conduit dead-end(편도) 가지치기 — 실제로 끊긴 연결은 토폴로지/하이라이트에서 제외.
  const { nodeIds: trNodeIds, cableIds: trCableIds } = pruneDanglingConduits(tr.nodeIds, tr.cableIds, cableById, kindOf);
  const tracedCables = trCableIds.map((id) => cableById.get(id)).filter((c): c is CableLike => !!c);

  // 코어번호 K: 시드 number, 없으면 트레이스 내 OUT 케이블의 number
  const K = seed.number ?? tracedCables.find((c) => c.sourceRole === 'OUT' || c.targetRole === 'OUT')?.number ?? null;

  // collapse: conduit(슬롯)→부모 OFD. parentById 가 null/미설정인 고아 슬롯이면 슬롯 자신을 유지
  // (현재 데이터 불변식상 모든 슬롯은 OFD 부모를 가짐 — 고아는 미발생). s===t 엣지는 아래서 스킵.
  const collapse = (id: string | null | undefined): string | null => {
    if (!id) return null;
    if (kindOf(id) === 'slot') return graph.parentById.get(id) ?? id;
    return id;
  };

  // ── 토폴로지 nodes ──
  const nodeById = new Map<string, TraceNode>();
  for (const raw of trNodeIds) {
    const id = collapse(raw);
    if (!id || nodeById.has(id)) continue;
    
    nodeById.set(id, {
      nodeId: id,
      nodeName: graph.nameById.get(id) ?? id,
      substationName: graph.subNameById.get(id) ?? '',
      substationId: '',
      floorId: null,
      materialCategoryCode: graphNodeIsOfd(graph, id) ? 'EQP-OFD' : null,
      isSource: collapse(start) === id,
      isTarget: false,
    });
  }

  // ── 토폴로지 edges ──
  const edges: TraceEdge[] = [];
  let seedFiberEdgeId: string | null = isOpgwTwin(seed) ? seed.id : null;
  const seedEnds = new Set([seed.sourceAssetId, seed.targetAssetId].filter(Boolean) as string[]);
  for (const c of tracedCables) {
    const s = collapse(c.sourceAssetId);
    const t = collapse(c.targetAssetId);
    if (!s || !t || s === t) continue;
    if (isOpgwTwin(c)) {
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

  // ── 표시 루트(steps/tree 전용 — 토폴로지 nodes/edges 와 무관) ──
  // 공급 원점부터 그리기 위해, 역할(IN/OUT)로 공급 경계 노드를 찾고 그 위 역할없는 passive
  // 체인을 따라 실제 말단(예: 축전지)까지 올라가 루트로 삼는다. 원점 없으면(순수 광) start(내 설비) 유지.
  const inSet = new Set(trNodeIds);
  const touch = new Map<string, CableLike[]>();
  for (const c of tracedCables) for (const a of [c.sourceAssetId, c.targetAssetId]) {
    if (a && inSet.has(a)) { const arr = touch.get(a); if (arr) arr.push(c); else touch.set(a, [c]); }
  }
  const isSupplierAt = (c: CableLike, n: string) => { const r = roleAt(c, n); if (r === 'OUT') return true; if (r === 'IN') return false; const o = other(c, n); return !!o && roleAt(c, o) === 'IN'; };
  const isSuppliedAt = (c: CableLike, n: string) => { const r = roleAt(c, n); if (r === 'IN') return true; if (r === 'OUT') return false; const o = other(c, n); return !!o && roleAt(c, o) === 'OUT'; };
  let rootId = start;
  const originNode = [...inSet].sort().find((n) => {
    const list = touch.get(n) ?? [];
    return list.some((c) => isSupplierAt(c, n)) && !list.some((c) => isSuppliedAt(c, n));
  });
  if (originNode) {
    let cur = originNode; const seen = new Set([cur]);
    for (;;) {
      const nexts = (touch.get(cur) ?? [])
        .filter((c) => { const o = other(c, cur); return !!o && roleAt(c, cur) == null && roleAt(c, o) == null && inSet.has(o) && !seen.has(o); })
        .map((c) => other(c, cur) as string);
      if (nexts.length !== 1) break;
      cur = nexts[0]; seen.add(cur);
    }
    rootId = cur;
  }

  const steps = buildSteps(rootId, trNodeIds, tracedCables, graph, collapse);
  const tree = buildTree(rootId, trNodeIds, tracedCables, graph, collapse);

  // ── 변전소별 내부경로 트리 — 토폴로지 노드가 내부경로 드릴다운과 동일하게 순서로(광스위치→설비→슬롯). ──
  // 변전소 안 내부 케이블(OPGW 아님) 하나를 시드로 buildInternalPath 재사용. 같은 단위 = 같은 표시.
  const internalSeedBySub = new Map<string, { subId: string; subName: string; cableId: string }>();
  for (const c of tracedCables) {
    if (isOpgwTwin(c)) continue; // OPGW 는 변전소 간(외부) — 내부 시드 아님
    const a = c.sourceAssetId ?? c.targetAssetId;
    const subId = a ? graph.subById.get(a) : undefined;
    if (!subId || internalSeedBySub.has(subId)) continue;
    internalSeedBySub.set(subId, { subId, subName: (a && graph.subNameById.get(a)) || '', cableId: c.id });
  }
  // 토폴로지 노드는 설비 체인(광스위치→송변전광단말)까지만 — 경로슬롯(conduit) 잎은 잘라낸다.
  // 박스 안에 있다는 것 자체가 그 슬롯으로 이어짐을 암시하므로, 긴 슬롯명으로 노드가 가로로 늘어나지 않게.
  const dropConduitLeaves = (n: TraceTreeNode): TraceTreeNode => {
    const children = n.children.filter((c) => kindOf(c.id) !== 'slot').map(dropConduitLeaves);
    return { ...n, children, isEndpoint: children.length === 0 };
  };
  const internalTrees = [...internalSeedBySub.values()]
    .map(({ subId, subName, cableId }) => {
      const r = buildInternalPath(cableId, subId, graph);
      if (!r || kindOf(r.tree.id) === 'slot') return null; // 루트가 슬롯뿐이면 표시 생략(폴백)
      return { substationName: subName, tree: dropConduitLeaves(r.tree) };
    })
    .filter((x): x is { substationName: string; tree: TraceTreeNode } => !!x);

  return {
    seedCableId, nodeIds: trNodeIds, cableIds: trCableIds,
    steps, tree, nodes: [...nodeById.values()], edges, rings, internalTrees, seedFiberEdgeId, truncated: !!tr.truncated,
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
    const ofd = graphNodeIsOfd(graph, cid);
    return ofd ? (graph.subNameById.get(cid) ?? graph.nameById.get(cid) ?? cid) : (graph.nameById.get(cid) ?? cid);
  };
  const build = (rawId: string, incoming: CableLike | null): TraceTreeNode | null => {
    const cid = collapse(rawId);
    if (!cid) return null;
    const isFiberEdge = !!incoming && isOpgwTwin(incoming);
    const tn: TraceTreeNode = { id: cid, label: labelOf(cid), isEndpoint: false, isFiberEdge, cableId: incoming?.id ?? null, children: [] };
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
    const isFiberEdge = !!incoming && isOpgwTwin(incoming);
    const ofd = graphNodeIsOfd(graph, cid);
    steps.push({
      id: cid,
      label: ofd ? (graph.subNameById.get(cid) ?? graph.nameById.get(cid) ?? cid) : (graph.nameById.get(cid) ?? cid),
      isEndpoint: i === 0 || i === chain.length - 1,
      isFiberEdge,
    });
  }
  return steps;
}
