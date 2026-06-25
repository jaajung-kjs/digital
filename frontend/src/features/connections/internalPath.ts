import { roleAt, other, isOpgwTwin } from '../cables/cableEndpoint';
import { fiberSlotLabel } from '../fiber/fiberSlotLabel';
import type { TraceGraph } from '../trace/traceGraph';
import type { TraceTreeNode } from '../trace/traceProjection';

type Cable = TraceGraph['cables'][number];

/**
 * 내부경로 단위 — 선택한 케이블이 속한 회로(같은 종류 케이블로 이어진) 중 **현재 변전소 안** 부분을
 * 끝에서 끝까지 한 줄로. 중간의 분기(피더 fan-out)만 그 자리에서 병렬로 갈라진다.
 *
 * 딱 세 단계, 조건부 휴리스틱·외부 헬퍼 없음:
 *  1) 추적 — 선택 케이블 양끝에서 같은 종류 케이블만 따라간다. 전이는 노드 종류로만 갈림(cableTrace 동일 원리):
 *     피더(distributor)=진입 역할로 IN↔OUT 분기, 슬롯(conduit)=같은 코어번호로만,
 *     설비(passive)=통과(단 번호 케이블로 들어오면 같은 번호/번호없는 패치로만 — 다른 회로끼리 안 이음).
 *  2) 시작점 — 공급 흐름(OUT→IN)의 **상류 끝** 하나. = 끝 단자(degree≤1) 중 '공급받는 쪽(하류 부하)'도
 *     '변전소를 빠져나가는 경계(conduit)'도 아닌 것. 둘 다 "하류"라서 배제 → 남는 게 상류.
 *     전원=충전기, 광=광스위치. 역할이 비어 있어도 구조로 잡혀 선택 자산과 무관하게 항상 같은 방향·루트.
 *  3) 표시 — 그 시작점에서 무방향 BFS 트리. 변전소 밖 가지는 잘라내고 crossed=true(밖은 토폴로지).
 *
 * 드릴다운과 (이후) 토폴로지 노드가 공유하는 단일 단위.
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

  // 같은 사용자 그룹 케이블의 노드별 인접.
  const at = new Map<string, Cable[]>();
  for (const c of graph.cables) {
    if ((c.groupId ?? null) !== groupId) continue;
    for (const e of [c.sourceAssetId, c.targetAssetId]) {
      if (!e) continue;
      const arr = at.get(e); if (arr) arr.push(c); else at.set(e, [c]);
    }
  }

  // ── 1) 추적: 변전소 한정 BFS(선택 케이블 양끝 시드, 설비는 통과) → nodeSet / cableSet / crossed ──
  const ends = [seed.sourceAssetId, seed.targetAssetId].filter(Boolean) as string[];
  const start = ends.find((e) => inSub(e) && (kindOf(e) === 'slot' || kindOf(e) === 'feeder')) ?? ends.find((e) => inSub(e)) ?? ends[0];
  if (!start) return null;

  const nodeSet = new Set<string>();
  const cableSet = new Set<string>([seed.id]);
  let crossed = false;
  for (const e of ends) { if (inSub(e)) nodeSet.add(e); else crossed = true; }

  const seen = new Set<string>(ends.map((e) => `${seed.id}|${e}`)); // 시드 재순회 방지
  const stack = ends.filter(inSub).map((e) => ({ a: e, via: seed, ch: seed.number ?? null }));
  let guard = 0;
  while (stack.length && guard++ < 3000) {
    const { a, via, ch } = stack.pop()!;
    const kind = kindOf(a);
    const here = (at.get(a) ?? []).filter((c) => c.id !== via.id);
    const entryRole = roleAt(via, a);
    let exits: Cable[];
    let nextCh: (c: Cable) => number | null = () => null;
    if (kind === 'feeder') {
      // 피더: OUT 으로 들어오면 IN 한 개로만(직렬), IN 으로 들어오면 모든 OUT 으로(분기).
      if (entryRole === 'OUT') exits = here.filter((c) => roleAt(c, a) === 'IN');
      else if (entryRole === 'IN') exits = here.filter((c) => roleAt(c, a) === 'OUT');
      else exits = here;
    } else if (kind === 'slot') {
      // 경로슬롯: 같은 번호(코어)로만 — 실제 물리연결.
      if (entryRole === 'OUT') { exits = here.filter((c) => roleAt(c, a) === 'IN'); nextCh = () => via.number ?? null; }
      else if (entryRole === 'IN') exits = here.filter((c) => roleAt(c, a) === 'OUT' && (c.number ?? null) === ch);
      else exits = here;
    } else {
      // 설비(passive): 통과하되 다른 번호 회로끼리는 안 잇는다 — 번호 케이블로 들어오면 같은
      // 번호 또는 번호없는(설비 패치)으로만(코어8→광스위치 ✓, 코어8→코어9 ✗). "물리연결" 원칙.
      exits = via.number != null ? here.filter((c) => c.number == null || c.number === via.number) : here;
    }

    for (const c of exits) {
      const nb = other(c, a);
      if (!nb) continue;
      const key = `${c.id}|${nb}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!inSub(nb)) { crossed = true; continue; } // 변전소 경계
      cableSet.add(c.id);
      nodeSet.add(nb);
      stack.push({ a: nb, via: c, ch: nextCh(c) });
    }
  }

  // ── 2) 시작점 = 공급 흐름의 상류 끝(하류 부하도, 변전소 경계 conduit 도 아닌 끝 단자) ──
  const tracedCables = [...cableSet].map((id) => cableById.get(id)).filter((c): c is Cable => !!c);
  const touch = new Map<string, Cable[]>();
  for (const c of tracedCables) for (const e of [c.sourceAssetId, c.targetAssetId]) {
    if (e && nodeSet.has(e)) { const arr = touch.get(e); if (arr) arr.push(c); else touch.set(e, [c]); }
  }
  // 공급받는 끝인가 — 이 케이블에서 n 이 IN(또는 상대가 OUT)이면 공급받는 쪽.
  const isSuppliedAt = (c: Cable, n: string) => { const r = roleAt(c, n); if (r === 'IN') return true; if (r === 'OUT') return false; const o = other(c, n); return !!o && roleAt(c, o) === 'OUT'; };
  const degreeOf = (n: string) => (touch.get(n)?.length ?? 0);
  const supplied = (n: string) => (touch.get(n) ?? []).some((c) => isSuppliedAt(c, n));
  // 시작점 = 공급 흐름의 상류 끝 = 끝 단자(degree≤1) 중 하류(공급받음)도 경계(conduit)도 아닌 것.
  // 전원=충전기, 광=광스위치. 역할이 비어 있어도 구조로 잡혀 선택 자산과 무관 — 끝→끝 한 줄, 분기는 피더에서만.
  // (둘 다 하류 끝이 없으면 = 순수 무방향 1자 회로면, 어느 끝에서 봐도 같은 한 줄이라 사전순 첫 끝.)
  const terminals = [...nodeSet].filter((n) => degreeOf(n) <= 1).sort();
  const rootId =
    terminals.find((n) => kindOf(n) !== 'slot' && !supplied(n))
    ?? terminals.find((n) => kindOf(n) !== 'slot')
    ?? terminals[0]
    ?? start;

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
