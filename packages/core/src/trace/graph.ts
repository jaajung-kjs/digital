import type { AssetRef, AssetTypeSpec, CableRef, PortRef } from '../catalog/types.js';

export interface TraceEdge {
  kind: 'cable' | 'internal';
  cableId?: string;
  toPortId: string;
}

export interface TraceGraph {
  edges: ReadonlyMap<string, readonly TraceEdge[]>;
  ports: ReadonlyMap<string, PortRef>;
}

export interface TraceHop {
  kind: 'cable' | 'internal';
  cableId?: string;
  fromPortId: string;
  toPortId: string;
}

/** 포트 노드 + 케이블 엣지 + 타입 InternalLinkRule 에서 파생한 내부 엣지로 그래프를 만든다. */
export function buildTraceGraph(args: {
  types: Record<string, AssetTypeSpec>;
  assets: AssetRef[];
  ports: PortRef[];
  cables: CableRef[];
}): TraceGraph {
  const edges = new Map<string, TraceEdge[]>();
  const push = (from: string, edge: TraceEdge) => {
    const list = edges.get(from);
    if (list) list.push(edge);
    else edges.set(from, [edge]);
  };

  for (const c of args.cables) {
    push(c.aPortId, { kind: 'cable', cableId: c.id, toPortId: c.bPortId });
    push(c.bPortId, { kind: 'cable', cableId: c.id, toPortId: c.aPortId });
  }

  const portsByAsset = new Map<string, PortRef[]>();
  for (const p of args.ports) {
    const list = portsByAsset.get(p.assetId);
    if (list) list.push(p);
    else portsByAsset.set(p.assetId, [p]);
  }

  for (const asset of args.assets) {
    const spec = args.types[asset.typeKey];
    if (!spec || spec.links.length === 0) continue;
    const mine = portsByAsset.get(asset.id) ?? [];
    const byGroup = new Map<string, PortRef[]>();
    for (const p of mine) {
      const list = byGroup.get(p.group);
      if (list) list.push(p);
      else byGroup.set(p.group, [p]);
    }
    for (const rule of spec.links) {
      const from = byGroup.get(rule.fromGroup) ?? [];
      const to = byGroup.get(rule.toGroup) ?? [];
      if (rule.mapping === 'byIndex') {
        const toByIndex = new Map(to.map((p) => [p.index, p]));
        for (const f of from) {
          const t = toByIndex.get(f.index);
          if (!t) continue;
          push(f.id, { kind: 'internal', toPortId: t.id });
          push(t.id, { kind: 'internal', toPortId: f.id });
        }
      } else {
        for (const f of from) {
          for (const t of to) {
            push(f.id, { kind: 'internal', toPortId: t.id });
            push(t.id, { kind: 'internal', toPortId: f.id });
          }
        }
      }
    }
  }

  return { edges, ports: new Map(args.ports.map((p) => [p.id, p])) };
}

/** 시작 포트에서 도달 가능한 모든 hop을 방문 순서(BFS)로 반환한다. */
export function traceFrom(graph: TraceGraph, startPortId: string): TraceHop[] {
  const hops: TraceHop[] = [];
  const visited = new Set<string>([startPortId]);
  const queue = [startPortId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const e of graph.edges.get(cur) ?? []) {
      if (visited.has(e.toPortId)) continue;
      visited.add(e.toPortId);
      const hop: TraceHop = { kind: e.kind, fromPortId: cur, toPortId: e.toPortId };
      if (e.cableId !== undefined) hop.cableId = e.cableId;
      hops.push(hop);
      queue.push(e.toPortId);
    }
  }
  return hops;
}
