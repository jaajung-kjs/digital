import type { AssetRef, AssetTypeSpec, CableRef, PortRef } from '../catalog/types.js';
import { isMultiCorePort } from '../catalog/portKinds.js';
import { internalLinkMap } from './internalLinks.js';

export interface TraceEdge {
  kind: 'cable' | 'internal';
  cableId?: string;
  toPortId: string;
  /**
   * 다심 포트를 드나드는 간선이 지나는 **코어 번호**.
   *
   * 인입 한 가닥을 포트 하나로 접으면 그 포트는 앞면 24포트와 모두 이어진다. 그대로 두면
   * 추적이 코어 3으로 들어가 코어 1로 나오는 길을 찾아 낸다 — 실제로는 없는 길이다.
   * 번호를 간선에 적어 두고 traceFrom 이 들고 다니면서 같은 번호로만 빠져나가게 한다.
   */
  position?: number;
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

/** 포트 노드 + 케이블 엣지 + 포트 선언에서 유도된 내부 엣지(`derivedLinks`)로 그래프를 만든다. */
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

  const portById = new Map(args.ports.map((p) => [p.id, p]));
  const isMulti = (id: string) => isMultiCorePort(portById.get(id)?.positions);

  // 자산 내부 통과(포트 ↔ 포트)는 상세 화면도 그대로 보여줘야 하므로 계산을 공유한다.
  for (const asset of args.assets) {
    const linked = internalLinkMap(portsByAsset.get(asset.id) ?? []);
    for (const [fromId, toIds] of linked) {
      for (const toPortId of toIds) {
        // 한쪽만 다심이면 그 간선이 지나는 코어는 **단심 쪽의 번호**다.
        const single = isMulti(fromId) !== isMulti(toPortId)
          ? portById.get(isMulti(fromId) ? toPortId : fromId)
          : undefined;
        const edge: TraceEdge = { kind: 'internal', toPortId };
        if (single) edge.position = single.index;
        push(fromId, edge);
      }
    }
  }

  return { edges, ports: portById };
}

/**
 * 시작 포트에서 도달 가능한 모든 hop을 방문 순서(BFS)로 반환한다.
 *
 * 걸어다니는 상태는 포트만이 아니라 **(포트, 코어 번호)** 다. 다심 인입에 코어 3으로
 * 들어갔으면 코어 3으로만 나온다 — 케이블을 건너가도 그 번호를 들고 간다(인입끼리는
 * 코어 번호가 1:1로 대응한다). 인입 포트 자체에서 시작하면 번호가 없으니 전부 퍼진다.
 */
export function traceFrom(graph: TraceGraph, startPortId: string): TraceHop[] {
  const hops: TraceHop[] = [];
  const isMulti = (id: string) => isMultiCorePort(graph.ports.get(id)?.positions);

  /* 방문 표시는 **포트 하나에 한 번**이다. 코어 번호는 어느 길로 빠져나갈지를 거르는 데만
     쓴다 — 번호까지 키에 넣으면 인입 포트가 코어마다 다른 노드로 보여, 앞면 4포트를 거쳐
     같은 인입으로 네 번 되돌아온다(실제로 그렇게 나왔다). */
  const start = { portId: startPortId, position: null as number | null };
  const visited = new Set<string>([startPortId]);
  const queue = [start];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === undefined) break;
    for (const e of graph.edges.get(cur.portId) ?? []) {
      let position = cur.position;
      if (e.position !== undefined) {
        if (isMulti(cur.portId)) {
          // 다심에서 나가는 길 — 들고 온 번호와 같은 코어로만.
          if (cur.position !== null && cur.position !== e.position) continue;
          position = null;
        } else {
          position = e.position; // 다심으로 들어간다 — 이 번호를 들고 간다.
        }
      }
      if (visited.has(e.toPortId)) continue;
      visited.add(e.toPortId);
      const hop: TraceHop = { kind: e.kind, fromPortId: cur.portId, toPortId: e.toPortId };
      if (e.cableId !== undefined) hop.cableId = e.cableId;
      hops.push(hop);
      queue.push({ portId: e.toPortId, position });
    }
  }
  return hops;
}
