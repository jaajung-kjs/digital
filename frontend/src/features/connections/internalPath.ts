import { roleAt, other, isOpgwTwin } from '../cables/cableEndpoint';
import type { TraceGraph } from '../trace/traceGraph';
import type { TraceTreeNode } from '../trace/traceProjection';

type Cable = TraceGraph['cables'][number];

/**
 * 내부경로 단위 — 서버가 반환한 연결 component(cableTrace 가 물리적으로 이어준 전부) 중
 * **도면에 표현 가능한 부분(= 현재 도면 floorId)** 만 트리로 레이아웃한다. 나머지(도면 밖)는
 * 토폴로지가 표현하므로 여기선 crossed 플래그로만 알린다. 유일한 구분은 "도면 안/밖"이며,
 * 그 안을 그릴 때의 표현 규칙(root·트리·선택 케이블 강조)만 더한다 — 추적/방향 로직은 없다.
 * (하이라이트는 같은 component 를 칠하므로 표시·하이라이트 항상 일치.)
 *
 * 세 단계:
 *  1) 파티션 — 같은 groupId 케이블 전체를 component 로 본다.
 *     localDrawingId(현 도면) 안 노드 = nodeSet. component 에 밖 노드가 있으면 crossed = true.
 *  2) 시작점 — 공급 흐름의 상류 끝(끝 단자 중 비-slot·비-supplied). 전원=충전기, 광=광스위치.
 *     degree 는 평행 케이블 수가 아니라 **고유 이웃 수**(한 슬롯에 여러 코어가 꽂혀도 끝 단자 판정 유지).
 *  3) rootId 에서 무방향 BFS 트리. 같은 이웃으로 가는 평행 케이블(코어 여러 개)은 하나로 접되
 *     **선택 케이블을 우선**해 그 엣지에 싣는다 → 클릭한 케이블이 경로에 보이고 양단이 강조된다.
 */
export function buildInternalPath(
  seedCableId: string,
  localDrawingId: string | null,
  graph: TraceGraph,
): { tree: TraceTreeNode; crossed: boolean } | null {
  const cableById = new Map(graph.cables.map((c) => [c.id, c]));
  const seed = cableById.get(seedCableId);
  if (!seed || !localDrawingId) return null;

  const kindOf = (id: string | null | undefined) => (id ? (graph.roleById.get(id) ?? null) : null);
  const inScope = (id: string | null | undefined): id is string => !!id && (graph.floorById?.get(id) ?? null) === localDrawingId;
  const groupId = seed.groupId ?? null;

  // ── 1) 파티션 — 같은 그룹 케이블 component 중 도면 안 → nodeSet / crossed ──
  const nodeSet = new Set<string>();
  let crossed = false;
  for (const c of graph.cables) {
    if ((c.groupId ?? null) !== groupId) continue;
    for (const e of [c.sourceAssetId, c.targetAssetId]) {
      if (!e) continue;
      if (inScope(e)) nodeSet.add(e);
      else crossed = true;
    }
  }
  if (nodeSet.size === 0) return null;

  // ── 2) 시작점 = 공급 흐름의 상류 끝(하류 부하도, 도면 경계 conduit 도 아닌 끝 단자) ──
  const tracedCables = graph.cables.filter((c) => (c.groupId ?? null) === groupId);
  const touch = new Map<string, Cable[]>();
  for (const c of tracedCables) for (const e of [c.sourceAssetId, c.targetAssetId]) {
    if (e && nodeSet.has(e)) { const arr = touch.get(e); if (arr) arr.push(c); else touch.set(e, [c]); }
  }
  // 공급받는 끝인가 — 이 케이블에서 n 이 IN(또는 상대가 OUT)이면 공급받는 쪽.
  const isSuppliedAt = (c: Cable, n: string) => { const r = roleAt(c, n); if (r === 'IN') return true; if (r === 'OUT') return false; const o = other(c, n); return !!o && roleAt(c, o) === 'OUT'; };
  // degree = 평행 케이블 수가 아니라 고유 이웃 수(한 슬롯↔설비에 코어가 여러 개여도 끝 단자 판정 유지).
  const degreeOf = (n: string) => {
    const nbrs = new Set<string>();
    for (const c of touch.get(n) ?? []) { const o = other(c, n); if (o && nodeSet.has(o)) nbrs.add(o); }
    return nbrs.size;
  };
  const supplied = (n: string) => (touch.get(n) ?? []).some((c) => isSuppliedAt(c, n));
  // 시작점 = 공급 흐름의 상류 끝 = 끝 단자(degree≤1) 중 하류(공급받음)도 경계(conduit)도 아닌 것.
  // 전원=충전기, 광=광스위치. 역할이 비어 있어도 구조로 잡혀 선택 자산과 무관.
  const terminals = [...nodeSet].filter((n) => degreeOf(n) <= 1).sort();
  const rootId =
    terminals.find((n) => kindOf(n) !== 'slot' && !supplied(n))
    ?? terminals.find((n) => kindOf(n) !== 'slot')
    ?? terminals[0]
    ?? [...nodeSet].sort()[0];

  // ── 3) 무방향 인접 → rootId 에서 BFS 트리 ──
  const adj = new Map<string, { to: string; cable: Cable }[]>();
  const addAdj = (x: string, to: string, c: Cable) => { const arr = adj.get(x); if (arr) arr.push({ to, cable: c }); else adj.set(x, [{ to, cable: c }]); };
  for (const c of tracedCables) {
    const s = c.sourceAssetId, t = c.targetAssetId;
    if (s && t && nodeSet.has(s) && nodeSet.has(t)) { addAdj(s, t, c); addAdj(t, s, c); }
  }
  const labelOf = (id: string) => graph.nameById.get(id) || id;

  const visited = new Set<string>([rootId]);
  const build = (id: string, incoming: Cable | null): TraceTreeNode => {
    // 같은 이웃으로 가는 평행 케이블(코어 여러 개)은 하나로 접되 선택 케이블을 우선 — 클릭한 케이블이 그 엣지에 실린다.
    const byNeighbor = new Map<string, { to: string; cable: Cable }>();
    for (const e of adj.get(id) ?? []) {
      if (visited.has(e.to)) continue;
      const prev = byNeighbor.get(e.to);
      if (!prev || e.cable.id === seedCableId) byNeighbor.set(e.to, e);
    }
    const kids = [...byNeighbor.values()].sort((a, b) => labelOf(a.to).localeCompare(labelOf(b.to)));
    const children: TraceTreeNode[] = [];
    for (const e of kids) { if (visited.has(e.to)) continue; visited.add(e.to); children.push(build(e.to, e.cable)); }
    return {
      id,
      label: labelOf(id),
      isEndpoint: children.length === 0,
      isFiberEdge: !!incoming && isOpgwTwin(incoming),
      cableId: incoming?.id ?? null,
      children,
    };
  };
  const tree = build(rootId, null);
  tree.isEndpoint = true; // 루트도 끝점 강조
  return { tree, crossed };
}
