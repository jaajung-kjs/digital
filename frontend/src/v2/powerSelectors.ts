import { ASSEMBLY_GRID, portFieldsFor, portValuesAt, slotNumber, type SeededMediumKey } from '@twin/core';
import { buildPortIndex, indexCablesByPort, mediumContainers, resolvePeer, type PeerInfo } from './peerResolve';
import type { V2Asset, V2Cable } from './types';

export type { PeerInfo } from './peerResolve';

export const POWER_MEDIUM: SeededMediumKey = 'power';

/** 전원 포트를 가진 부품을 담고 있는 설비들 — 이름순. */
export function powerContainers(assets: V2Asset[]): V2Asset[] {
  return mediumContainers(assets, POWER_MEDIUM);
}

export interface PowerCell {
  portId: string | null;
  cableId: string | null;
  peer: PeerInfo | null;
}

export interface PowerRow {
  /** 회로 자리 번호(1-based) — 그 설비의 설비 종류의 격자에서 유도한다. 자리가 없으면 null. */
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
  /** 설비 종류가 선언한 격자 — 주면 빈 자리도 행으로 만든다(패널 스케줄). */
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
