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
 * 반(盤) 하나 — **전원을 나눠 주는 것**(출력 회로가 여럿인 자산).
 *
 * 소내전원반 · 분전반의 계통마다 선 피더 · 충전기 분전반이 다 이것이다. 이름으로 고르지
 * 않는다 — 나누면 반이고, 하나를 하나로 보내면 거쳐 가는 자리다(`isBoard`).
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
    /**
     * 반에 닿기까지 **거쳐 온 것들** — 정류기·인버터·강압기처럼 나누지 않고 지나가는 기기들.
     *
     * 이것이 없으면 직류 모선의 머리줄이 「IR-48 50A #1 에서 온다」에서 끊긴다 — 그 정류기가
     * 무엇을 먹고 사는지가 화면 어디에도 없다. 현장 조서는 그래서 두 줄을 함께 적는다:
     * 「#1 충전기 : SCR 48V 100A」 그리고 「그 충전기의 AC 입력 : 통합분전반 Load 1번」.
     */
    via: { assetId: string; name: string }[];
  }[];
  circuits: PowerCircuit[];
  children: PowerNode[];
}

/** 그 포트에 적힌 값들 — 선언된 칸만, 기본값까지 얹어서. */
function declaredPortValues(port: V2Asset['ports'][number]): Record<string, unknown> {
  const values = portValuesAt(port, 1);
  /* 선언이 주는 값(전압)은 **없으면 없는 것**이다 — 기본값으로 메우면 화면이 사실을 지어낸다.
     적힌 값이 없을 때 뜻이 있는 것은 개폐뿐이고(안 적었으면 투입), 그건 선언이 말한다. */
  return Object.fromEntries(
    portFieldsFor(port.medium, port.positions, port.variant)
      .map((f) => [f.key, values[f.key] ?? (f.readOnly ? null : f.defaultValue ?? null)]),
  );
}

/**
 * 이 자산이 반인가 — **나누는가.**
 *
 * 한때 「전원 출력 포트가 하나라도 있으면 반」이었다. 그러면 정류기·인버터·강압기·절체
 * 스위치처럼 **하나를 받아 하나로 보내는 것**까지 전부 묶음이 되어, 한 국에 반이 열둘씩
 * 섰다(실제 자료의 조서는 넷·다섯이다). 分電이라는 말 그대로다 — 하나를 하나로 보내는 것은
 * 나누는 것이 아니라 **거쳐 가는 것**이다.
 *
 * 거쳐 가는 것들은 사라지지 않는다. 반의 머리줄에 **「무엇을 거쳐 왔는가」**로 남는다
 * (`sources[].via`) — 현장 조서가 「#1 충전기 : SCR 48V 100A용 충전기 / AC입력 : 통합분전반
 * 220V 3φ Load 1번」이라 적는 그 자리다.
 */
const outCount = (a: V2Asset) => a.ports.filter((p) => p.medium === POWER_MEDIUM && p.direction === 'OUT').length;
const isBoard = (a: V2Asset) => outCount(a) > 1;

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

  /**
   * 케이블을 따라 **반에 닿을 때까지 지나간다** — 나누지 않는 기기는 지나가는 자리다.
   *
   * 상용 피더의 분기 하나가 UPS 정류기를 먹이고, 그 UPS 가 정류기→DC링크→인버터→절체
   * 스위치를 거쳐 UPS 피더로 나온다. 케이블 한 칸만 보면 그 사이가 전부 끊겨, 상용 피더와
   * UPS 피더가 **서로 남남인 두 그루**로 선다. 실제로는 한 계통이다.
   *
   * 멈추는 자리가 둘이다. **반**(거기서 나뉜다)과, **갈 곳이 하나로 정해지지 않는 자리**다 —
   * UPS 절체 스위치는 입력이 둘(인버터·바이패스)이라 「어디서 오나」에 한 줄로 답할 수 없다.
   * 그때는 그 자리에서 멈춘다. 모르는 것을 지어내는 것보다 낫다.
   */
  const walkThrough = (
    startPortId: string,
    /** 올라가는가(입력 쪽) 내려가는가(출력 쪽) — 지나가는 기기에서 탈 포트의 방향이 이걸 따른다. */
    dir: 'up' | 'down',
  ): { assetId: string | null; via: { assetId: string; name: string }[] } => {
    const via: { assetId: string; name: string }[] = [];
    const seen = new Set<string>();
    let portId = startPortId;
    for (;;) {
      const cable = cableOf(portId);
      if (!cable) return { assetId: null, via };
      const nextId = peerAssetIdOf(portId, cable);
      if (nextId == null || boardIds.has(nextId)) return { assetId: nextId, via };
      if (seen.has(nextId)) return { assetId: null, via }; // 고리 — 더 가지 않는다
      seen.add(nextId);
      const through = byId.get(nextId);
      if (!through) return { assetId: null, via };
      /* 지나가는 기기에서 **반대편**으로 탄다 — 올라갈 땐 그 기기의 입력, 내려갈 땐 출력. */
      const outs = through.ports.filter((p) => p.medium === POWER_MEDIUM && p.direction === (dir === 'up' ? 'IN' : 'OUT'));
      via.push({ assetId: through.id, name: through.name });
      if (outs.length !== 1) return { assetId: null, via }; // 갈 곳이 정해지지 않는다 — 여기서 멈춘다
      portId = outs[0]!.id;
    }
  };

  const nodeOf = (board: V2Asset): PowerNode => {
    const parent = board.parentAssetId ? (byId.get(board.parentAssetId) ?? null) : null;
    const powerPorts = board.ports.filter((p) => p.medium === POWER_MEDIUM);
    const sources = powerPorts
      .filter((p) => p.direction === 'IN')
      .map((p) => {
        const cable = cableOf(p.id);
        /* **반까지 거슬러 올라간다** — 정류기·인버터를 지나온 길은 `via` 가 말한다. */
        const up = walkThrough(p.id, 'up');
        return {
          portId: p.id,
          variant: p.variant,
          cableId: cable?.id ?? null,
          from: cable ? resolvePeer(p, cable, portIndex, board.substationId) : null,
          fromAssetId: up.assetId,
          portValues: declaredPortValues(p),
          values: cable?.specParams ?? {},
          via: up.via,
        };
      });
    const circuits = powerPorts
      .filter((p) => p.direction === 'OUT')
      .sort((a, b) => a.index - b.index)
      .map((p) => {
        const cable = cableOf(p.id);
        /* 이 회로가 **또 다른 반**을 먹이는가 — 변환기를 지나서라도. 케이블 한 칸만 보면
           상용 피더와 UPS 피더가 남남인 두 그루로 선다(사이에 UPS 가 있다). */
        const loadAssetId = walkThrough(p.id, 'down').assetId;
        return {
          portId: p.id,
          index: p.index,
          name: p.name,
          variant: p.variant,
          portValues: declaredPortValues(p),
          cableId: cable?.id ?? null,
          load: cable ? resolvePeer(p, cable, portIndex, board.substationId) : null,
          values: cable?.specParams ?? {},
          feedsAssetId: loadAssetId,
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
  /**
   * 다른 반이 **먹이는** 반들 — 아니면 뿌리다(밖에서 온다).
   *
   * 판정을 **회로 쪽에서** 한다. 나무의 가지가 회로이므로(부모의 어느 회로가 나를 먹이나)
   * 입력 쪽으로 따로 물으면 둘이 어긋난다: 절체 스위치처럼 입력이 둘인 기기를 거치면
   * 내려갈 때는 이어지는데 올라갈 때는 멈춘다 — 그러면 그 반이 **가지로 한 번, 뿌리로 한 번**
   * 두 곳에 선다(회로가 두 번 세어진다).
   */
  const fedIds = new Set(
    boards.flatMap((b) => nodes.get(b.id)!.circuits.map((c) => c.feedsAssetId).filter((id): id is string => id != null)),
  );

  const placed = new Set<string>();
  const expand = (node: PowerNode): PowerNode => {
    placed.add(node.assetId);
    /* **한 반이 같은 반을 두 회로로 먹일 수 있다** — 상용 반의 분기 하나는 UPS 정류기로,
       또 하나는 바이패스로 가는데 둘 다 UPS 반에 닿는다. 걸러 낸 다음 펴면 그 두 회로가
       각각 한 그루씩 펴서 같은 반이 두 번 선다(회로가 두 번 세어진다) — 펴면서 걸러야 한다. */
    node.children = node.circuits
      .map((c) => c.feedsAssetId)
      .filter((id): id is string => id != null)
      .flatMap((id) => (placed.has(id) ? [] : [expand(nodes.get(id)!)]));
    return node;
  };

  const byName = (a: PowerNode, b: PowerNode) => a.name.localeCompare(b.name, 'ko');
  /* **계통을 이루는 뿌리가 먼저**다 — 아직 결선하지 않은 반이 많은 국에서는(개발 중인 자료가
     늘 그렇다) 이름순으로 세우면 실제 계통이 스무 줄 아래로 밀려 안 보인다. */
  const feedsSomething = (n: PowerNode) => n.circuits.some((c) => c.feedsAssetId != null);
  const roots = boards
    .map((b) => nodes.get(b.id)!)
    .filter((n) => !fedIds.has(n.assetId))
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
