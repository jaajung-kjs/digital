import { portFieldsFor, portValuesAt, type SeededMediumKey } from '@twin/core';
import { buildPortIndex, cableAt, indexCablesByPort, resolvePeer, type PeerInfo } from './peerResolve';
import type { V2Asset, V2Cable } from './types';

export type { PeerInfo } from './peerResolve';

export const POWER_MEDIUM: SeededMediumKey = 'power';

// ──────────────────────────────────────────────
// 계통 나무 — 전원이 어디서 와서 어디로 가나
// ──────────────────────────────────────────────

/**
 * 회로 하나 = **출력 포트 하나**.
 *
 * 실무 대장(분전반 수용내역)의 한 줄이 이것이다: 번호 · 용량 · 용도 · 전원케이블 · 개폐.
 * 예전 표는 「피더 자산 하나 = 한 줄」이라 13구 분배반이 한 줄로 뭉갰다 — 회로마다 따로
 * 끊기는데(개폐는 포트의 값이다) 화면에는 그 열셋이 없었다.
 */
export interface PowerCircuit {
  portId: string;
  /** 이 회로가 교류인가 직류인가 — 전압 목록이 이걸 따라 좁아진다. */
  variant?: string | null;
  /** 회로 번호 — 포트 번호가 곧 회로 번호다(L1·L2…). */
  index: number;
  name: string;
  /**
   * 이 회로(포트)에 적힌 값들 — 용량 · 개폐. **선언된 기본값까지 얹은 것**이다.
   *
   * 무엇이 들었는지는 종류 선언이 정한다(`portFieldsFor`). 화면이 키를 알지 않는다.
   */
  portValues: Record<string, unknown>;
  cableId: string | null;
  /** 이 회로가 먹이는 것 — 용도. 도면 밖이면 케이블에 적힌 대국까지가 전부다. */
  load: PeerInfo | null;
  /** 케이블에 적힌 값(전압 등) — 무엇을 적는지는 종류 선언이 정한다. */
  values: Record<string, unknown>;
  /** 먹이는 것이 **또 다른 반**이면 그 자산 id — 나무의 가지가 여기서 갈린다. */
  feedsAssetId: string | null;
}

/**
 * 반(盤) 하나 — **전원을 나눠 주는 것**(출력 포트를 가진 자산).
 *
 * 소내배전반 · AC MAIN · UPS 출력 · 충전기 DC반 · 정보통신용 분전반 · 랙 안의 전원분배반이
 * 다 이것이다. 이름으로 고르지 않는다 — 출력 포트가 있으면 반이고, 입력만 있으면 부하다.
 */
export interface PowerNode {
  assetId: string;
  name: string;
  /** 이 반을 품은 설비 — 화면은 「분전반 · DC 48V」처럼 부른다. */
  containerId: string | null;
  containerName: string | null;
  /**
   * 어디서 받는가 — 입력 포트마다 하나씩.
   *
   * 둘 이상일 수 있다(이중화: 충전기 #1·#2 가 같은 DC 버스를 먹인다). 나무에서는 **처음
   * 닿은 갈래에만** 펴고, 나머지는 이 목록이 말한다 — 같은 반을 두 군데에 그리면 회로가
   * 두 번 세어진다.
   */
  sources: {
    portId: string;
    /** 이 입력이 교류인가 직류인가. */
    variant?: string | null;
    cableId: string | null;
    from: PeerInfo | null;
    fromAssetId: string | null;
    /** 입력 차단기의 값들 — 배전반 주차단기, UPS·정류기의 입력 MCCB. 출력과 다른 둘이다. */
    portValues: Record<string, unknown>;
    /** 그 인입 케이블에 적힌 값(길이·전압) — 회로 줄과 같은 칸을 쓴다. */
    values: Record<string, unknown>;
  }[];
  circuits: PowerCircuit[];
  children: PowerNode[];
}

/** 그 포트에 적힌 값들 — 선언된 칸만, 기본값까지 얹어서. */
function declaredPortValues(port: V2Asset['ports'][number]): Record<string, unknown> {
  const values = portValuesAt(port, 1);
  /* 갈래까지 넘긴다 — 전압의 기본값이 갈래마다 다르다(교류 220V 1φ · 직류 48V). */
  return Object.fromEntries(
    portFieldsFor(port.medium, port.positions, port.variant).map((f) => [f.key, values[f.key] ?? f.defaultValue ?? null]),
  );
}

/** 이 자산이 반인가 — 전원을 나눠 주는가. */
const isBoard = (a: V2Asset) => a.ports.some((p) => p.medium === POWER_MEDIUM && p.direction === 'OUT');

/**
 * 이 변전소의 **전원 계통**을 나무로.
 *
 * 뿌리는 **입력이 이 도면 밖에서 오는 반**이다(소내분전반: 입력 포트에 케이블이 없거나,
 * 그 케이블의 상대가 이 도면의 반이 아니다). 가지는 출력 케이블을 따라간다.
 *
 * 「상용이냐 UPS 계열이냐 DC 냐」를 따로 적지 않는다 — **경로가 곧 갈래다**. 이름이나 종류로
 * 「이건 UPS 다」를 알아맞히려 들면 그 순간 사람이 붙인 글자에 계통이 매달린다.
 *
 * 어디에도 닿지 못한 반(배선이 고리를 이룬 자료 등)도 **버리지 않고** 뿌리로 세운다 —
 * 화면에서 조용히 사라지는 것이 가장 나쁘다.
 */
export function powerTree(assets: V2Asset[], cables: V2Cable[]): PowerNode[] {
  const boards = assets.filter(isBoard);
  const boardIds = new Set(boards.map((b) => b.id));
  const byId = new Map(assets.map((a) => [a.id, a]));
  const { cablesByAPortId, cablesByBPortId } = indexCablesByPort(cables);
  const portIndex = buildPortIndex(assets);
  const cableOf = (portId: string) => cableAt(portId, cablesByAPortId, cablesByBPortId);
  const peerAssetIdOf = (portId: string, cable: V2Cable) => {
    const otherId = cable.aPortId === portId ? cable.bPortId : cable.aPortId;
    return portIndex.get(otherId)?.asset.id ?? null;
  };

  const nodeOf = (board: V2Asset): PowerNode => {
    const parent = board.parentAssetId ? (byId.get(board.parentAssetId) ?? null) : null;
    const powerPorts = board.ports.filter((p) => p.medium === POWER_MEDIUM);
    const sources = powerPorts
      .filter((p) => p.direction === 'IN')
      .map((p) => {
        const cable = cableOf(p.id);
        return {
          portId: p.id,
          variant: p.variant,
          cableId: cable?.id ?? null,
          from: cable ? resolvePeer(p, cable, portIndex, board.substationId) : null,
          fromAssetId: cable ? peerAssetIdOf(p.id, cable) : null,
          portValues: declaredPortValues(p),
          values: cable?.specParams ?? {},
        };
      });
    const circuits = powerPorts
      .filter((p) => p.direction === 'OUT')
      .sort((a, b) => a.index - b.index)
      .map((p) => {
        const cable = cableOf(p.id);
        const loadAssetId = cable ? peerAssetIdOf(p.id, cable) : null;
        return {
          portId: p.id,
          index: p.index,
          name: p.name,
          variant: p.variant,
          portValues: declaredPortValues(p),
          cableId: cable?.id ?? null,
          load: cable ? resolvePeer(p, cable, portIndex, board.substationId) : null,
          values: cable?.specParams ?? {},
          feedsAssetId: loadAssetId && boardIds.has(loadAssetId) ? loadAssetId : null,
        };
      });
    return {
      assetId: board.id,
      name: board.name,
      containerId: parent?.id ?? null,
      containerName: parent?.name ?? null,
      sources,
      circuits,
      children: [],
    };
  };

  const nodes = new Map(boards.map((b) => [b.id, nodeOf(b)]));
  /** 이 도면 안의 다른 반에서 받는가 — 아니면 뿌리다(밖에서 온다). */
  const fedByBoard = (n: PowerNode) => n.sources.some((s) => s.fromAssetId != null && boardIds.has(s.fromAssetId));

  const placed = new Set<string>();
  const expand = (node: PowerNode): PowerNode => {
    placed.add(node.assetId);
    node.children = node.circuits
      .map((c) => c.feedsAssetId)
      .filter((id): id is string => id != null && !placed.has(id))
      .map((id) => expand(nodes.get(id)!));
    return node;
  };

  const byName = (a: PowerNode, b: PowerNode) => a.name.localeCompare(b.name, 'ko');
  /* **계통을 이루는 뿌리가 먼저**다 — 아직 결선하지 않은 반이 많은 국에서는(개발 중인 자료가
     늘 그렇다) 이름순으로 세우면 실제 계통이 스무 줄 아래로 밀려 안 보인다. */
  const feedsSomething = (n: PowerNode) => n.circuits.some((c) => c.feedsAssetId != null);
  const roots = boards
    .map((b) => nodes.get(b.id)!)
    .filter((n) => !fedByBoard(n))
    .sort((a, b) => Number(feedsSomething(b)) - Number(feedsSomething(a)) || byName(a, b))
    .map(expand);

  /* 고리를 이룬 배선처럼 어느 뿌리에서도 못 닿는 반 — 뒤에 세운다(사라지게 두지 않는다).
     **한 그루씩 펴면서 걸러야 한다**: 먼저 다 걸러 놓으면 A 를 펴면서 딸려 온 B 가 뿌리로
     한 번 더 선다(고리에서 실제로 그랬다). */
  const orphans: PowerNode[] = [];
  for (const b of [...boards].sort((x, y) => x.name.localeCompare(y.name, 'ko'))) {
    if (!placed.has(b.id)) orphans.push(expand(nodes.get(b.id)!));
  }

  return [...roots, ...orphans];
}
