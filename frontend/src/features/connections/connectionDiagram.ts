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

  const candidates = graph.cables.filter((c) => isSelf(c.sourceAssetId) || isSelf(c.targetAssetId));

  // 한 pool 안에서 공급 원점(OUT≥1, IN==0)을 찾는다. 경계 OPGW(IN-IN)도 IN 으로 센다.
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
    for (const [a, list] of touch) {
      const outN = list.filter((c) => roleAt(c, a) === 'OUT').length;
      const inN = list.filter((c) => roleAt(c, a) === 'IN').length;
      if (outN >= 1 && inN === 0) out.push(a);
    }
    return out;
  };

  const poolByType = new Map<string, Set<string>>();
  for (const seed of candidates) {
    const ct = seed.cableType ?? '';
    const ends = [seed.sourceAssetId, seed.targetAssetId];
    const start = ends.find((e) => e && kindOf(e) === null) ?? ends.find((e) => e && isSelf(e)) ?? seed.sourceAssetId;
    if (!start) continue;
    let pool = poolByType.get(ct);
    if (!pool) { pool = new Set(); poolByType.set(ct, pool); }
    const tr = cableTrace(start, ct, graph.assets, graph.cables);
    tr.cableIds.forEach((id) => pool!.add(id));
    pool.add(seed.id);
    // 공급 원점을 향해 추적했으면, 그 원점에서 다시 하류로 펼쳐 형제 분배까지 포함시킨다.
    const tracedOrigins = new Set<string>();
    let frontier = originsIn(pool);
    while (frontier.length) {
      const next: string[] = [];
      for (const o of frontier) {
        if (tracedOrigins.has(o)) continue;
        tracedOrigins.add(o);
        cableTrace(o, ct, graph.assets, graph.cables).cableIds.forEach((id) => pool!.add(id));
      }
      for (const o of originsIn(pool)) if (!tracedOrigins.has(o)) next.push(o);
      frontier = next;
    }
  }

  const groupMap = new Map<string, DiagramGroup>();
  const addToGroup = (cg: CategoryGroup, comp: DiagramComponent) => {
    let g = groupMap.get(cg.key);
    if (!g) { g = { key: cg.key, label: cg.label, color: cg.color, components: [] }; groupMap.set(cg.key, g); }
    else if (!g.color && cg.color) g.color = cg.color;
    g.components.push(comp);
  };

  for (const pool of poolByType.values()) {
    const poolCables = [...pool].map((id) => cableById.get(id)).filter((c): c is Cable => !!c);
    const inSub = (id?: string | null) => !!id && subOf(id) === selfSub;
    const adj = new Map<string, { to: string; cable: Cable }[]>();
    const boundaryNodes = new Set<string>();
    const touchCables = new Map<string, Cable[]>();
    const addAdj = (a: string, to: string, c: Cable) => { const r = adj.get(a); if (r) r.push({ to, cable: c }); else adj.set(a, [{ to, cable: c }]); };
    const addTouch = (a: string, c: Cable) => { const r = touchCables.get(a); if (r) r.push(c); else touchCables.set(a, [c]); };
    for (const c of poolCables) {
      const s = c.sourceAssetId, t = c.targetAssetId;
      if (!s || !t) continue;
      if (inSub(s)) addTouch(s, c);
      if (inSub(t)) addTouch(t, c);
      if (inSub(s) && inSub(t)) { addAdj(s, t, c); addAdj(t, s, c); }
      else if (inSub(s)) boundaryNodes.add(s);
      else if (inSub(t)) boundaryNodes.add(t);
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
        const cs = touchCables.get(n) ?? [];
        const outN = cs.filter((c) => roleAt(c, n) === 'OUT').length;
        const inN = cs.filter((c) => roleAt(c, n) === 'IN').length;
        if (outN >= 1 && inN === 0) { origin = n; break; }
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
      const build = (id: string): DiagramNode => ({
        id,
        label: resolveName(id),
        kind: boundaryNodes.has(id) ? 'boundary' : 'asset',
        isSelf: isSelf(id),
        isOrigin: id === origin,
        edgeFiber: isOpgw(parentEdge.get(id) ?? null),
        children: (childOrder.get(id) ?? []).map(build),
      });
      const root = build(rootId);
      const compCableIds = [...new Set(poolCables.filter((c) => compNodes.has(c.sourceAssetId ?? '') || compNodes.has(c.targetAssetId ?? '')).map((c) => c.id))];
      const seedCableId = compCableIds[0] ?? '';
      const repCable = cableById.get(seedCableId);
      const cg = repCable ? categoryGroupOf(repCable) : { key: '기타', label: '기타', color: null };
      addToGroup(cg, { seedCableId, root, cableIds: compCableIds, nodeIds: [...compNodes] });
    }
  }

  const groups = [...groupMap.values()];
  for (const g of groups) g.components.sort((a, b) => a.root.label.localeCompare(b.root.label));
  groups.sort((a, b) => a.label.localeCompare(b.label));
  return groups;
}
