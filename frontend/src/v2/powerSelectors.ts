import { ASSEMBLY_GRID, portFieldsFor, portValuesAt, slotNumber, type SeededMediumKey } from '@twin/core';
import { buildPortIndex, cableAt, indexCablesByPort, mediumContainers, resolvePeer, type PeerInfo } from './peerResolve';
import type { V2Asset, V2Cable } from './types';

export type { PeerInfo } from './peerResolve';

export const POWER_MEDIUM: SeededMediumKey = 'power';

/** 전원 포트를 가진 장비를 담고 있는 설비들 — 이름순. */
export function powerContainers(assets: V2Asset[]): V2Asset[] {
  return mediumContainers(assets, POWER_MEDIUM);
}

export interface PowerCell {
  portId: string | null;
  cableId: string | null;
  peer: PeerInfo | null;
}

export interface PowerRow {
  /** 회로 자리 번호(1-based) — 그 설비의 설비 품목의 격자에서 유도한다. 자리가 없으면 null. */
  slotNo: number | null;
  /** 비어 있는 회로 자리 — 패널 스케줄의 SPARE. 이 행에는 피더가 없다. */
  feederId: string;
  feederName: string;
  /**
   * 이 회로의 개폐 — **출력 포트**에 담긴다. 자산의 필드가 아니다.
   *
   * 차단기가 닫혔는가는 그 회로의 상태이지 기기의 속성이 아니다(출력이 여럿인 기기는
   * 회로마다 따로 끊긴다). 포트가 없으면 적을 곳도 없으므로 null.
   *
   * 이 표는 **부하로 나가는 쪽**을 센다. 입력측 차단기도 따로 있고 포트 판에서 여닫지만,
   * 회로 한 줄이 살았는지를 말하는 자리는 그 회로의 출력이다.
   */
  closed: boolean | null;
  /** 전원 입력 — 대국 + 그 케이블에 적힌 값들(무엇을 적는지는 종류 선언이 정한다). */
  inCell: PowerCell & { values: Record<string, unknown> };
  outCell: PowerCell;
}

/**
 * 이 피더가 몇 번 회로인가 — **패널에서의 자리**가 곧 회로 번호다.
 *
 * 예전에는 커스텀 필드 `breakerNo` 를 먼저 보고 없을 때만 자리로 물러섰다. 그런데 표에는
 * 자리 번호와 차단기 번호가 나란히 떠서 같은 값을 두 번 적는 꼴이었고(1/1, 2/2 …),
 * 정렬 기준은 화면에 안 보이는 쪽이었다. 보이는 것으로 센다.
 * 격자에 놓이지 않았으면(자리 없음) null — 그때는 이름순으로 물러선다.
 */
function circuitNumber(feeder: V2Asset): number | null {
  return feeder.col != null && feeder.row != null
    ? slotNumber(ASSEMBLY_GRID.cols, feeder.col, feeder.row)
    : null;
}

/**
 * 이 포트가 투입돼 있는가 — 어떤 값을 보는지는 종류 선언이 정한다(화면이 키를 모른다).
 * 적힌 값이 없으면 선언된 기본값(투입)이다.
 */
function closedOf(port: V2Asset['ports'][number]): boolean | null {
  const field = portFieldsFor(port.medium).find((f) => f.type === 'boolean');
  return field ? portValuesAt(port, 1)[field.key] === true : null;
}


/**
 * Builds power rows for a container.
 * Feeders are children of container with power ports, sorted by name.
 * inCell/outCell: first port with direction 'IN'/'OUT' respectively (port data field, not role branching).
 * 3-tier peer resolution via shared helper: local effective -> saved refs -> null.
 * inCell.values: IN 케이블의 specParams 그대로.
 */
export function buildPowerRows(
  container: V2Asset,
  assets: V2Asset[],
  cables: V2Cable[],
  /** 설비 품목이 선언한 격자 — 주면 빈 자리도 행으로 만든다(패널 스케줄). */
): PowerRow[] {
  const { cablesByAPortId, cablesByBPortId } = indexCablesByPort(cables);

  /* 회로 순서 = 물리적 자리 순서.
     전기 도면의 패널 스케줄은 회로 번호가 곧 패널에서의 위치라 번호순으로 읽는다.
     예전에는 이름순이라 "1번 옆이 2번" 이라는 감각이 없었다.
     번호는 차단기 번호(커스텀 필드) → 슬롯 인덱스 → 이름 순으로 찾는다. */
  const feeders = assets
    .filter(
      (a) =>
        a.parentAssetId === container.id &&
        a.ports.some((p) => p.medium === POWER_MEDIUM),
    )
    .sort((a, b) => {
      const na = circuitNumber(a);
      const nb = circuitNumber(b);
      if (na != null && nb != null && na !== nb) return na - nb;
      if (na != null && nb == null) return -1;
      if (na == null && nb != null) return 1;
      return a.name.localeCompare(b.name);
    });

  // portId → { port, asset } index (hoisted — shared helper)
  const portIndex = buildPortIndex(assets);

  const rows: PowerRow[] = [];

  for (const feeder of feeders) {
    // First IN / OUT power ports (direction is port data, not a role branch)
    const inPort = feeder.ports.find((p) => p.medium === POWER_MEDIUM && p.direction === 'IN');
    const outPort = feeder.ports.find((p) => p.medium === POWER_MEDIUM && p.direction === 'OUT');

    // Resolve inCell
    const inCell: PowerCell & { values: Record<string, unknown> } = {
      portId: inPort?.id ?? null,
      cableId: null,
      peer: null,
      values: {},
    };

    if (inPort) {
      const inCable = cablesByAPortId.get(inPort.id) || cablesByBPortId.get(inPort.id) || null;
      if (inCable) {
        inCell.cableId = inCable.id;
        inCell.peer = resolvePeer(inPort, inCable, portIndex, container.substationId);
        inCell.values = inCable.specParams ?? {};
      }
    }

    // Resolve outCell
    const outCell: PowerCell = {
      portId: outPort?.id ?? null,
      cableId: null,
      peer: null,
    };

    if (outPort) {
      const outCable = cablesByAPortId.get(outPort.id) || cablesByBPortId.get(outPort.id) || null;
      if (outCable) {
        outCell.cableId = outCable.id;
        outCell.peer = resolvePeer(outPort, outCable, portIndex, container.substationId);
      }
    }

    rows.push({
      slotNo: circuitNumber(feeder),
      feederId: feeder.id,
      feederName: feeder.name,
      closed: outPort ? closedOf(outPort) : null,
      inCell,
      outCell,
    });
  }

  /* **빈 회로를 지어내지 않는다.** 예전에는 격자 칸 수만큼(`cols × rows`) 빈 행을 만들어
     「12회로 분전반」을 표현했다 — 도화지 칸 수를 회로 수라고 우긴 것이다. 격자는 자산을
     놓는 도화지일 뿐이고 모든 설비가 같은 판을 쓰므로, 그대로 두면 어느 분전반이든 200행이
     된다. 표는 **실제로 놓인 피더만** 나열한다. */
  rows.sort((a, b) => (a.slotNo ?? 0) - (b.slotNo ?? 0));

  return rows;
}

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
  return Object.fromEntries(portFieldsFor(port.medium).map((f) => [f.key, values[f.key] ?? null]));
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
