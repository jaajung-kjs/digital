import { roleAt, other, isOpgwTwin } from '../cables/cableEndpoint';
import { fiberSlotLabel } from '../fiber/fiberSlotLabel';
import type { TraceGraph } from '../trace/traceGraph';
import type { TraceTreeNode } from '../trace/traceProjection';

type Cable = TraceGraph['cables'][number];

/**
 * 내부경로 단위 — 서버가 격리한 스트랜드 component(단일 물리 코어/파이버)를
 * 현재 변전소 기준 트리로 레이아웃한다. 채널 재순회 없음: 입력 graph 는 U1 이후
 * 이미 strand-격리돼 있으므로 channel 매칭·role 전이 BFS 는 불필요하다.
 *
 * 두 단계만:
 *  1) 파티션 — 같은 groupId 케이블 전체를 strand 로 본다.
 *     localSubId 안 노드 = nodeSet. strand 에 localSubId 밖 노드가 있으면 crossed = true.
 *  2) 시작점 — 공급 흐름의 상류 끝(끝 단자 중 비-slot·비-supplied). 전원=충전기, 광=광스위치.
 *     역할이 비어 있어도 구조로 결정되므로 선택 케이블과 무관 — 항상 같은 방향.
 *  3) rootId 에서 무방향 BFS 트리(labelOf / isFiberEdge / cableId).
 */
export function buildInternalPath(
  seedCableId: string,
  localSubId: string | null,
  graph: TraceGraph,
): { tree: TraceTreeNode; crossed: boolean } | null {
  const cableById = new Map(graph.cables.map((c) => [c.id, c]));
  const seed = cableById.get(seedCableId);
  if (!seed || !localSubId) return null;

  const kindOf = (id: string | null | undefined) => (id ? (graph.roleById.get(id) ?? null) : null);
  const inSub = (id: string | null | undefined): id is string => !!id && graph.subById.get(id) === localSubId;
  const groupId = seed.groupId ?? null;

  // ── 1) strand = 같은 그룹 케이블의 순수 파티션 → nodeSet / crossed ──
  const nodeSet = new Set<string>();
  let crossed = false;
  for (const c of graph.cables) {
    if ((c.groupId ?? null) !== groupId) continue;
    for (const e of [c.sourceAssetId, c.targetAssetId]) {
      if (!e) continue;
      if (inSub(e)) nodeSet.add(e);
      else crossed = true;
    }
  }
  if (nodeSet.size === 0) return null;

  // ── 2) 시작점 = 공급 흐름의 상류 끝(하류 부하도, 변전소 경계 conduit 도 아닌 끝 단자) ──
  const tracedCables = graph.cables.filter((c) => (c.groupId ?? null) === groupId);
  const touch = new Map<string, Cable[]>();
  for (const c of tracedCables) for (const e of [c.sourceAssetId, c.targetAssetId]) {
    if (e && nodeSet.has(e)) { const arr = touch.get(e); if (arr) arr.push(c); else touch.set(e, [c]); }
  }
  // 공급받는 끝인가 — 이 케이블에서 n 이 IN(또는 상대가 OUT)이면 공급받는 쪽.
  const isSuppliedAt = (c: Cable, n: string) => { const r = roleAt(c, n); if (r === 'IN') return true; if (r === 'OUT') return false; const o = other(c, n); return !!o && roleAt(c, o) === 'OUT'; };
  const degreeOf = (n: string) => (touch.get(n)?.length ?? 0);
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
  const labelOf = (id: string) =>
    kindOf(id) === 'slot' ? (fiberSlotLabel(id, graph) || graph.nameById.get(id) || id) : (graph.nameById.get(id) || id);

  const visited = new Set<string>([rootId]);
  const build = (id: string, incoming: Cable | null): TraceTreeNode => {
    const kids = (adj.get(id) ?? [])
      .filter((e) => !visited.has(e.to))
      .sort((a, b) => labelOf(a.to).localeCompare(labelOf(b.to)));
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
