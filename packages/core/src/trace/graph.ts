import type { AssetRef, AssetTypeSpec, CableRef, Direction, PortRef } from '../catalog/types.js';
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
  /**
   * 이 간선을 **전기가 어느 쪽으로 지나는가** — `from → to` 를 기준으로.
   *
   * 예전에는 걷는 쪽이 **출발 포트 하나만** 보고 판단했다(`dir === 'IN'` 이면 거슬러 오르는
   * 길). 양끝이 다 입력 아니면 출력인 동안에는 맞는 말이었다 — 케이블은 반대끼리만 이어지고
   * (`pairing: 'opposite'`) 내부 통과도 입력↔출력만 유도되니, 한쪽만 알면 다른 쪽이 정해졌다.
   *
   * **방향 없는 자리(`BI`)가 생기면 그 전제가 깨진다.** 축전지 단자가 그렇다: 한 쌍으로
   * 충전도 방전도 오간다. 출발 포트만 보면 그 자리에서 어느 쪽으로 흐르는지 알 길이 없고,
   * 「방향 없으면 다 통과」로 두면 모선에서 **형제 회로로 되쏟아진다**(그 반이 먹이는
   * 출력들이 상류 추적에 딸려 나온다 — 방향 규칙이 애초에 막던 그 버그다).
   *
   * 그래서 **양끝을 함께 본다.** 방향 없는 끝은 상대의 반대 노릇을 한다 — 모선 단자가
   * 출력과 이어지면 그 자리에서는 공급원(IN)이고, 입력과 이어지면 소비자(OUT)다. 양끝이 다
   * 방향 없으면(모선끼리 이음) 정해지지 않는다.
   *
   * 방향이 없는 종류(광·네트워크·제어)는 `'either'` — 그 선로에는 상·하류가 없다.
   */
  along: EdgeFlow;
}

/** 간선을 지나는 방향 — `from → to` 로 갈 때 전기와 **같은 쪽**인가 거스르는가. */
export type EdgeFlow = 'downstream' | 'upstream' | 'either';

/**
 * 이 간선을 전기가 어느 쪽으로 지나는가 — **양끝의 방향이 함께 정한다.**
 *
 * @param sourceRole 전기가 **나오는** 쪽의 방향. 케이블은 출력에서 나오고(`OUT`), 기기
 *   안에서는 입력에서 나온다(`IN`). 이 한 값이 두 경우의 차이 전부다.
 * @param to 상대 끝의 방향. 이 워킹 카피에 없는 끝점(국을 넘는 케이블의 건너편)이면
 *   `undefined` — 그때는 예전처럼 출발 포트만 보고 정한다(아는 것까지만 말한다).
 */
export function edgeFlow(
  sourceRole: 'IN' | 'OUT',
  from: Direction,
  to: Direction | undefined,
): EdgeFlow {
  /* 양끝이 다 방향 없는 자리 — 모선끼리의 이음이다. 어느 쪽으로도 흐를 수 있다. */
  if (from === 'BI' && (to === 'BI' || to === undefined)) return 'either';
  /* 방향 없는 끝은 **상대의 반대 노릇**을 한다: 출력과 이어졌으면 그 자리에서는 공급원이다. */
  const effective = from === 'BI' ? (to === 'IN' ? 'OUT' : 'IN') : from;
  return effective === sourceRole ? 'downstream' : 'upstream';
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
  /**
   * **이미 지난 자리로 다시 닿은 간선** — 갈래가 다시 만나는 곳이다. 여기서 더 걷지 않는다.
   *
   * 걷기는 포트를 한 번만 밟는다(`visited`). 그것만으로 결과를 세우면 **스패닝 트리**가 되어,
   * 정말은 갈라졌다 다시 모이는 길(DAG)에서 **공유하는 윗동아리가 먼저 온 갈래에만 붙는다**:
   * 정류기 둘이 같은 상용 피더에서 먹는데 화면에는 한쪽에만 상용 피더가 섰고, 다른 쪽은
   * 「교류 출력 2」에서 그냥 끊겼다 — 배선은 맞는데 그림이 거짓말을 했다.
   *
   * 그래서 **걷지는 않되 간선은 남긴다.** 트리를 세울 때 이 홉은 마디를 새로 만들지 않고
   * 이미 선 마디를 **가리키고**(`TraceTreeNode.ref`), 레인 그래프는 그 자리에서 갈래를
   * 내려보낸다(합류의 짝이다).
   */
  revisit?: true;
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

  const portById = new Map(args.ports.map((p) => [p.id, p]));
  const dirOf = (id: string): Direction | undefined => portById.get(id)?.direction;
  /* 방향이 뜻을 갖는 종류에서만 간선에 방향이 있다 — 광·네트워크에는 상·하류가 없다.
     매체는 **출발 포트가** 안다(상대는 이 카피에 없을 수 있다). */
  const directed = (id: string) => portKind(portById.get(id)?.medium ?? '')?.pairing === 'opposite';
  const along = (sourceRole: 'IN' | 'OUT', from: string, to: string): EdgeFlow => {
    const d = dirOf(from);
    if (d === undefined || !directed(from)) return 'either';
    return edgeFlow(sourceRole, d, dirOf(to));
  };

  for (const c of args.cables) {
    /* 전기는 **출력에서 케이블로 나온다**. */
    push(c.aPortId, { kind: 'cable', cableId: c.id, toPortId: c.bPortId, along: along('OUT', c.aPortId, c.bPortId) });
    push(c.bPortId, { kind: 'cable', cableId: c.id, toPortId: c.aPortId, along: along('OUT', c.bPortId, c.aPortId) });
  }

  const portsByAsset = new Map<string, PortRef[]>();
  for (const p of args.ports) {
    const list = portsByAsset.get(p.assetId);
    if (list) list.push(p);
    else portsByAsset.set(p.assetId, [p]);
  }

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
        /* 기기 안에서 전기는 **입력에서 출력으로** 지난다. */
        const edge: TraceEdge = { kind: 'internal', toPortId, along: along('IN', fromId, toPortId) };
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
export type Flow = 'upstream' | 'downstream' | 'both';

/**
 * 이 포트에 **물을 수 있는 질문들** — 하나면 그 답 하나, 둘이면 따로 답해야 한다.
 *
 * 입력은 「어디서 오나」 하나, 출력은 「어디로 가나」 하나다. 방향을 따지지 않는 종류
 * (광·네트워크·제어)는 상·하류가 없으니 한 번에 다 퍼진다 — 질문이 하나다.
 *
 * **방향이 뜻을 갖는 종류의 방향 없는 자리(모선 단자)만 질문이 둘이다.** 축전지가 그렇다:
 * 평상시엔 정류기가 나를 충전하고, 정전이면 내가 부하를 먹인다. 두 답을 한 그루에 섞으면
 * 공급원과 부하가 **형제로** 서서 넷이 같은 것처럼 읽힌다 — 실제로는 방향이 반대인 둘씩이다.
 * 답이 둘인 물음에 그루를 하나만 그린 것이 잘못이었다.
 *
 * 화면은 이 목록의 길이만 보면 된다 — 「방향 없는 자리면 둘로 나눈다」를 화면이 다시 적으면
 * 어휘가 늘 때마다 그 판단이 두 곳에서 갈린다.
 */
export function traceFlows(port: { medium: string; direction: Direction } | undefined): Flow[] {
  if (port == null || portKind(port.medium)?.pairing !== 'opposite') return ['both'];
  if (port.direction === 'IN') return ['upstream'];
  if (port.direction === 'OUT') return ['downstream'];
  return ['upstream', 'downstream'];
}

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
export function traceFrom(graph: TraceGraph, startPortId: string, ask?: Flow): TraceHop[] {
  const hops: TraceHop[] = [];
  const isMulti = (id: string) => isMultiCorePort(graph.ports.get(id)?.positions);

  /* 묻는 방향 — 누른 포트가 정한다(`traceFlows`). 질문이 둘인 자리(모선 단자)는 부르는
     쪽이 어느 질문인지 말해 준다. 안 말하면 예전처럼 한 번에 다 퍼진다. */
  const questions = traceFlows(graph.ports.get(startPortId));
  const flow: Flow = ask ?? (questions.length === 1 ? questions[0]! : 'both');

  /**
   * **묻는 방향이 곧 출발 자리의 방향이다.**
   *
   * 입력을 누르면 그 포트는 제 케이블로 나간다 — 제 장비 안을 옆으로 헤집지 않는다
   * (`직류 출력 2` 에서 형제 출력으로 새지 않는 것이 그것이다). 방향 있는 자리는 선언된
   * 방향이 그 일을 이미 하고 있었다.
   *
   * 방향 없는 자리(모선 단자)에는 선언이 없어서, 그래프가 적어 둔 `along`(양끝으로 정한
   * 것)을 그대로 쓰면 **첫걸음부터 제 모선 안으로 퍼진다** — 축전지 단자를 물었는데
   * 정류기와 부하가 다 나왔다. 그런데 물음이 이미 답을 준다: 「전원 측」으로 묻는다는 것은
   * **이 자리를 입력으로 놓고 묻는다**는 뜻이다.
   *
   * 그래서 출발 자리에서 나가는 간선만 그 방향으로 다시 잰다. 한 걸음 건너간 뒤부터는
   * 선언된 방향이 다시 다스린다 — 축전지 단자에서 물으면 모선 너머가 그대로 나온다.
   */
  const startDir = graph.ports.get(startPortId)?.direction;
  const askedDir: Direction | null = startDir === 'BI' && flow !== 'both'
    ? (flow === 'upstream' ? 'IN' : 'OUT')
    : null;
  const alongOf = (fromPortId: string, edge: TraceEdge): EdgeFlow => {
    if (askedDir === null || fromPortId !== startPortId) return edge.along;
    /* 케이블은 출력에서 나오고, 기기 안에서는 입력에서 나온다 — `edgeFlow` 와 같은 규칙. */
    return edgeFlow(edge.kind === 'cable' ? 'OUT' : 'IN', askedDir, graph.ports.get(edge.toPortId)?.direction);
  };

  /** 이 간선이 그 방향으로 가는 길인가 — 판단은 그래프가 끝냈다(`along`). */
  const allowed = (fromPortId: string, edge: TraceEdge): boolean => {
    if (flow === 'both') return true;
    const along = alongOf(fromPortId, edge);
    return along === 'either' || along === flow;
  };

  /* 방문 표시는 **포트 하나에 한 번**이다. 코어 번호는 어느 길로 빠져나갈지를 거르는 데만
     쓴다 — 번호까지 키에 넣으면 인입 포트가 코어마다 다른 노드로 보여, 앞면 4포트를 거쳐
     같은 인입으로 네 번 되돌아온다(실제로 그렇게 나왔다). */
  const start = { portId: startPortId, position: null as number | null };
  const visited = new Set<string>([startPortId]);
  /** 이미 적은 간선(무향) — 되짚는 길을 「다시 만났다」로 적지 않게 한다. */
  const walked = new Set<string>();
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
      /* 간선 하나는 **한 번만** 적는다. 간선은 양쪽에 다 걸려 있어서, 그러지 않으면 방금
         타고 온 길을 되짚어 「다시 만났다」고 적는다(방향 없는 종류에서 특히 그렇다). */
      const edge = cur.portId < e.toPortId ? `${cur.portId}|${e.toPortId}` : `${e.toPortId}|${cur.portId}`;
      if (walked.has(edge)) continue;
      walked.add(edge);
      const hop: TraceHop = { kind: e.kind, fromPortId: cur.portId, toPortId: e.toPortId };
      if (e.cableId !== undefined) hop.cableId = e.cableId;
      /* 이미 밟은 자리 — **간선만 남기고 걷지 않는다**(갈래가 다시 만나는 곳). */
      if (visited.has(e.toPortId)) {
        hop.revisit = true;
        hops.push(hop);
        continue;
      }
      visited.add(e.toPortId);
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
