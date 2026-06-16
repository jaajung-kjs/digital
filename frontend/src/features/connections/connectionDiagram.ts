import { cableTrace } from '../trace/cableTrace';
import { buildSelfSideChecker, buildEndpointNameResolver } from './endpointName';
import type { TraceGraph } from '../trace/traceGraph';
import type { Asset } from '../../types/asset';

export interface DiagramNode {
  id: string;
  label: string;
  kind: 'asset' | 'boundary';
  isSelf: boolean;
  isOrigin: boolean;
  edgeFiber: boolean;
  children: DiagramNode[];
}
export interface DiagramComponent { seedCableId: string; root: DiagramNode; cableIds: string[]; nodeIds: string[]; }
export interface DiagramGroup { key: string; label: string; color: string | null; components: DiagramComponent[]; }
interface CategoryGroup { key: string; label: string; color: string | null }
type Cable = TraceGraph['cables'][number];

export function buildConnectionDiagram(opts: {
  graph: TraceGraph; assets: Asset[]; assetId: string;
  categoryGroupOf: (cable: { categoryId?: string | null; cableType?: string | null; displayColor?: string | null }) => CategoryGroup;
}): DiagramGroup[] {
  const { graph, assets, assetId, categoryGroupOf } = opts;
  const isSelf = buildSelfSideChecker(assets, assetId);
  const nameOf = buildEndpointNameResolver(assets);
  const kindById = new Map(graph.assets.map((a) => [a.id, a.connectionKind ?? null]));
  const kindOf = (id?: string | null) => (id ? (kindById.get(id) ?? null) : null);
  const subOf = (id?: string | null) => (id ? (graph.subById.get(id) ?? null) : null);
  const selfSub = subOf(assetId);
  const cableById = new Map(graph.cables.map((c) => [c.id, c]));
  const resolveName = (id: string) => nameOf(id) || graph.nameById.get(id) || id;
  const roleAt = (c: Cable, a: string) => (c.sourceAssetId === a ? c.sourceRole : c.targetRole) ?? null;
  const other = (c: Cable, a: string) => (c.sourceAssetId === a ? c.targetAssetId : c.sourceAssetId) ?? null;
  // 공급 방향: IN 끝=공급받음(하류), OUT 끝=공급(상류). 한쪽 역할만 있으면 반대끝이 보완한다
  //  (실데이터: 입력 케이블이 피더쪽만 IN, 공급원쪽은 NULL — 그래도 공급원을 원점으로 잡아야 함).
  const isSuppliedAt = (c: Cable, n: string) => {
    const r = roleAt(c, n); if (r === 'IN') return true; if (r === 'OUT') return false;
    const o = other(c, n); return !!o && roleAt(c, o) === 'OUT';
  };
  const isSupplierAt = (c: Cable, n: string) => {
    const r = roleAt(c, n); if (r === 'OUT') return true; if (r === 'IN') return false;
    const o = other(c, n); return !!o && roleAt(c, o) === 'IN';
  };
  // 공급 원점 = 공급하는(supplier) 엣지 ≥1 이고 공급받는(supplied) 엣지 0 인 노드.
  const isOriginNode = (list: Cable[], n: string) =>
    list.some((c) => isSupplierAt(c, n)) && !list.some((c) => isSuppliedAt(c, n));

  const candidates = graph.cables.filter((c) => isSelf(c.sourceAssetId) || isSelf(c.targetAssetId));

  const originsIn = (cableIds: Iterable<string>): string[] => {
    const cs = [...cableIds].map((id) => cableById.get(id)).filter((c): c is Cable => !!c);
    const touch = new Map<string, Cable[]>();
    for (const c of cs) {
      for (const a of [c.sourceAssetId, c.targetAssetId]) {
        if (!a) continue;
        const r = touch.get(a); if (r) r.push(c); else touch.set(a, [c]);
      }
    }
    const out: string[] = [];
    for (const [a, list] of touch) if (isOriginNode(list, a)) out.push(a);
    return out;
  };

  // 각 candidate 의 passive(설비) 끝에서 cableTrace = 한 회로(circuit). cableTrace 가 conduit
  // 채널을 격리하므로 같은 슬롯이라도 다른 코어(포트)는 다른 회로가 된다 — 포트별 분리가 물리
  // 연결대로 자동으로 일어난다(휴리스틱 없음). passive 끝이 없는 케이블(OPGW 트렁크=양끝 conduit)은
  // seed 안 함(설비 seed 가 그 회로를 포함). 전력은 공급 원점에서 하류로 down-fan 해 형제까지 포함.
  const circuits: string[][] = [];
  const seenSig = new Set<string>();
  for (const seed of candidates) {
    const ct = seed.cableType ?? '';
    const ends = [seed.sourceAssetId, seed.targetAssetId];
    const start = ends.find((e) => e && kindOf(e) === null) ?? ends.find((e) => e && isSelf(e) && kindOf(e) !== 'conduit');
    if (!start) continue;
    const set = new Set<string>(cableTrace(start, ct, graph.assets, graph.cables).cableIds);
    set.add(seed.id);
    const tracedOrigins = new Set<string>();
    let frontier = originsIn(set);
    while (frontier.length) {
      const next: string[] = [];
      for (const o of frontier) {
        if (tracedOrigins.has(o)) continue;
        tracedOrigins.add(o);
        cableTrace(o, ct, graph.assets, graph.cables).cableIds.forEach((id) => set.add(id));
      }
      for (const o of originsIn(set)) if (!tracedOrigins.has(o)) next.push(o);
      frontier = next;
    }
    const sig = ct + '|' + [...set].sort().join('|');
    if (seenSig.has(sig)) continue;
    seenSig.add(sig);
    circuits.push([...set]);
  }

  const groupMap = new Map<string, DiagramGroup>();
  const addToGroup = (cg: CategoryGroup, comp: DiagramComponent) => {
    let g = groupMap.get(cg.key);
    if (!g) { g = { key: cg.key, label: cg.label, color: cg.color, components: [] }; groupMap.set(cg.key, g); }
    else if (!g.color && cg.color) g.color = cg.color;
    g.components.push(comp);
  };

  for (const circuitCableIds of circuits) {
    const poolCables = circuitCableIds.map((id) => cableById.get(id)).filter((c): c is Cable => !!c);
    const inSub = (id?: string | null) => !!id && subOf(id) === selfSub;
    const adj = new Map<string, { to: string; cable: Cable }[]>();
    const boundaryNodes = new Set<string>();
    const boundaryRemote = new Map<string, string>(); // in-sub 노드 → 대국(off-sub) 이웃 id
    const touchCables = new Map<string, Cable[]>();
    const addAdj = (a: string, to: string, c: Cable) => { const r = adj.get(a); if (r) r.push({ to, cable: c }); else adj.set(a, [{ to, cable: c }]); };
    const addTouch = (a: string, c: Cable) => { const r = touchCables.get(a); if (r) r.push(c); else touchCables.set(a, [c]); };
    for (const c of poolCables) {
      const s = c.sourceAssetId, t = c.targetAssetId;
      if (!s || !t) continue;
      if (inSub(s)) addTouch(s, c);
      if (inSub(t)) addTouch(t, c);
      if (inSub(s) && inSub(t)) { addAdj(s, t, c); addAdj(t, s, c); }
      else if (inSub(s)) { boundaryNodes.add(s); boundaryRemote.set(s, t); }
      else if (inSub(t)) { boundaryNodes.add(t); boundaryRemote.set(t, s); }
    }
    const allInSub = new Set([...touchCables.keys()]);
    const seen = new Set<string>();
    for (const startNode of allInSub) {
      if (seen.has(startNode)) continue;
      const compNodes = new Set<string>();
      const stack = [startNode];
      while (stack.length) { const n = stack.pop()!; if (compNodes.has(n)) continue; compNodes.add(n); seen.add(n); for (const e of adj.get(n) ?? []) if (!compNodes.has(e.to)) stack.push(e.to); }

      let origin: string | null = null;
      for (const n of [...compNodes].sort()) {
        if (isOriginNode(touchCables.get(n) ?? [], n)) { origin = n; break; }
      }
      const selfInComp = [...compNodes].filter((n) => isSelf(n)).sort();
      const rootId = origin ?? selfInComp[0] ?? [...compNodes].sort()[0];

      const parentEdge = new Map<string, Cable | null>([[rootId, null]]);
      const childOrder = new Map<string, string[]>();
      const q = [rootId];
      while (q.length) {
        const cur = q.shift()!;
        for (const { to, cable } of (adj.get(cur) ?? []).sort((a, b) => resolveName(a.to).localeCompare(resolveName(b.to)))) {
          if (parentEdge.has(to)) continue;
          parentEdge.set(to, cable);
          const co = childOrder.get(cur); if (co) co.push(to); else childOrder.set(cur, [to]);
          q.push(to);
        }
      }
      const isOpgw = (c: Cable | null) => !!c && c.sourceRole === 'IN' && c.targetRole === 'IN';
      // 대국 경계 노드(슬롯) 라벨 = "로컬변전소 - 대국변전소"(OPGW 링크). subName 없으면 자산명 폴백.
      const subName = (id?: string | null) => (id ? (graph.subNameById.get(id) ?? null) : null);
      const boundaryLabel = (id: string): string => {
        const local = subName(id), remote = subName(boundaryRemote.get(id));
        return local && remote ? `${local} - ${remote}` : resolveName(id);
      };
      const build = (id: string): DiagramNode => ({
        id,
        label: boundaryNodes.has(id) ? boundaryLabel(id) : resolveName(id),
        kind: boundaryNodes.has(id) ? 'boundary' : 'asset',
        isSelf: isSelf(id),
        isOrigin: id === origin,
        edgeFiber: isOpgw(parentEdge.get(id) ?? null),
        children: (childOrder.get(id) ?? []).map(build),
      });
      const fullRoot = build(rootId);

      // 가지치기: 루트→self 경로 + self 하위만 유지. 단말 관점=내 공급경로(형제 제거),
      // 통과설비 관점=내 하위 분배 전체. 한 규칙 = 조상(self) ∪ self ∪ 하위(self).
      const hasSelfBelow = new Map<string, boolean>();
      const computeHasSelf = (n: DiagramNode): boolean => {
        let v = n.isSelf;
        for (const c of n.children) if (computeHasSelf(c)) v = true;
        hasSelfBelow.set(n.id, v);
        return v;
      };
      computeHasSelf(fullRoot);
      const prune = (n: DiagramNode, underSelf: boolean): DiagramNode => {
        const nowUnder = underSelf || n.isSelf;
        const kids = n.children.filter((c) => hasSelfBelow.get(c.id) || nowUnder).map((c) => prune(c, nowUnder));
        return { ...n, children: kids };
      };
      const root = prune(fullRoot, false);

      // 표시된(가지친) 트리의 노드/케이블 = 하이라이트 대상.
      const nodeIds: string[] = [];
      const cableIdSet = new Set<string>();
      const walk = (n: DiagramNode, isRoot: boolean) => {
        nodeIds.push(n.id);
        if (!isRoot) { const c = parentEdge.get(n.id); if (c) cableIdSet.add(c.id); }
        n.children.forEach((ch) => walk(ch, false));
      };
      walk(root, true);
      const cableIds = [...cableIdSet];
      // seed = self 에 닿는 케이블 우선([상세] 토폴로지 진입점).
      const selfSet = new Set(nodeIds.filter((id) => isSelf(id)));
      const seedCableId =
        cableIds.find((cid) => { const c = cableById.get(cid); return !!c && (selfSet.has(c.sourceAssetId ?? '') || selfSet.has(c.targetAssetId ?? '')); })
        ?? cableIds[0] ?? '';
      const repCable = cableById.get(cableIds[0] ?? '') ?? cableById.get(seedCableId);
      const cg = repCable ? categoryGroupOf(repCable) : { key: '기타', label: '기타', color: null };
      addToGroup(cg, { seedCableId, root, cableIds, nodeIds });
    }
  }

  const groups = [...groupMap.values()];
  for (const g of groups) g.components.sort((a, b) => a.root.label.localeCompare(b.root.label));
  groups.sort((a, b) => a.label.localeCompare(b.label));
  return groups;
}
