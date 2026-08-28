import type { AssetRef, AssetTypeSpec, CableRef, PortRef } from '../catalog/types.js';
import { isMultiCorePort, portKind } from '../catalog/portKinds.js';
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
  /**
   * 이 홉이 **다심 포트로 들어갈 때** 타고 가는 코어 번호. 다심이 아닌 자리로 가는 홉에는 없다.
   *
   * 이것이 붙었다는 것은 곧 **닿은 자리가 지나가는 자리**라는 뜻이다 — 다심 포트에는 아무것도
   * 서 있지 않고, 그 너머의 성단·점퍼를 거쳐야 장비가 나온다. 그래서 트리를 세울 때 이 홉은
   * 마디를 만들지 않고 접힌다(`buildTraceTree`). 마디로 세웠더니 24심이 포트 하나라 이름이
   * `슬롯#1` 로 겹쳤고, 대국이 성단되지 않은 코어는 **아무 데도 안 닿았는데** 슬롯 이름이
   * 대국인 양 남았다.
   */
  core?: number;
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
 * **묻는 방향** — 흐름이 있는 종류(전원)에서 누른 포트가 정한다.
 *
 * 입력을 누르면 「내 전원이 어디서 오나」이고, 출력을 누르면 「이 회로가 무엇을 먹이나」다.
 * 방향이 없는 종류(광·네트워크·제어)는 양쪽으로 퍼진다 — 그 선로에는 상·하류가 없다.
 */
type Flow = 'upstream' | 'downstream' | 'both';

/**
 * 시작 포트에서 도달 가능한 모든 hop을 방문 순서(BFS)로 반환한다.
 *
 * 걸어다니는 상태는 포트만이 아니라 **(포트, 코어 번호)** 다. 다심 인입에 코어 3으로
 * 들어갔으면 코어 3으로만 나온다 — 케이블을 건너가도 그 번호를 들고 간다(인입끼리는
 * 코어 번호가 1:1로 대응한다). 인입 포트 자체에서 시작하면 번호가 없으니 전부 퍼진다.
 *
 * **전원은 흐르는 방향이 있다.** 전기는 출력에서 케이블을 타고 입력으로 가고, 기기 안에서는
 * 입력에서 출력으로 지난다. 그 방향을 안 지키면 상류로 거슬러 올라가다가 그 반의 **다른
 * 출력들로 되쏟아진다** — 단말 하나에서 추적했는데 그 반이 먹이는 스물세 자산이 다 딸려
 * 나왔다(실측 120홉). 내 전원이 어디서 오는지 묻는 사람에게 남의 회로는 답이 아니다.
 */
export function traceFrom(graph: TraceGraph, startPortId: string): TraceHop[] {
  const hops: TraceHop[] = [];
  const isMulti = (id: string) => isMultiCorePort(graph.ports.get(id)?.positions);
  const directionOf = (id: string) => graph.ports.get(id)?.direction;

  /* 흐름이 있는 종류에서만 방향을 지킨다 — 광·네트워크는 상·하류가 없다. */
  const startPort = graph.ports.get(startPortId);
  const directed = portKind(startPort?.medium ?? '')?.pairing === 'opposite';
  const flow: Flow = !directed || startPort == null || startPort.direction === 'BI'
    ? 'both'
    : startPort.direction === 'IN' ? 'upstream' : 'downstream';

  /**
   * 이 간선이 그 방향으로 가는 길인가.
   *
   * 거슬러 오를 때: **내 입력에서** 케이블을 건너 상류의 출력으로 가고, 그 기기 **안에서는
   * 출력에서 입력으로** 거슬러 지난다. 내려갈 때는 그 반대다.
   */
  const allowed = (fromPortId: string, edge: TraceEdge): boolean => {
    if (flow === 'both') return true;
    const dir = directionOf(fromPortId);
    if (edge.kind === 'cable') return dir === (flow === 'upstream' ? 'IN' : 'OUT');
    return dir === (flow === 'upstream' ? 'OUT' : 'IN');
  };

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
      if (!allowed(cur.portId, e)) continue;
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
      /* 다심으로 들어가는 길이면 어느 코어를 타는지 남긴다 — 그 자리를 부를 이름이 없다.
         **모르는 포트도 마찬가지다.** 국을 넘는 구간 케이블의 건너편은 이 워킹 카피에 없어
         「다심인가」를 물을 수 없는데, 그 자리야말로 코어가 필요한 곳이다(대국 OPGW). 코어를
         들고 서 있다는 것 자체가 지금 다심을 타는 중이라는 뜻이므로 그대로 적어 준다. */
      if (position !== null && (isMulti(e.toPortId) || !graph.ports.has(e.toPortId))) {
        hop.core = position;
      }
      hops.push(hop);
      queue.push({ portId: e.toPortId, position });
    }
  }
  return hops;
}
