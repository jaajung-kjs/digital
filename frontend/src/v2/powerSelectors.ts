import type { SeededMediumKey } from '@twin/core';
import { buildPortIndex, indexCablesByPort, mediumContainers, resolvePeer, type MediumContainer, type PeerInfo } from './peerResolve';
import type { V2Asset, V2Cable } from './types';

export type { PeerInfo } from './peerResolve';

export const POWER_MEDIUM: SeededMediumKey = 'power';

/**
 * Returns assets that have at least one child with power ports.
 * Results are sorted by name.
 */
export function powerContainers(assets: V2Asset[]): MediumContainer[] {
  return mediumContainers(assets, POWER_MEDIUM);
}

export interface PowerCell {
  portId: string | null;
  cableId: string | null;
  peer: PeerInfo | null;
}

export interface PowerRow {
  /** 회로 자리 번호(1-based) — 컨테이너가 슬롯 수를 선언했을 때만. 자유형이면 null. */
  slotNo: number | null;
  /** 비어 있는 회로 자리 — 패널 스케줄의 SPARE. 이 행에는 피더가 없다. */
  empty: boolean;
  feederId: string;
  feederName: string;
  switchState: string | null;
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
 * 자유형 컨테이너(자리 번호 없음)면 null — 그때는 이름순으로 물러선다.
 */
function circuitNumber(feeder: V2Asset): number | null {
  return feeder.slotIndex != null ? feeder.slotIndex + 1 : null;
}

/** fieldValues 값 문자열화 — 없으면 null (런타임 변환, 캐스트 아님) */
function fieldString(value: unknown): string | null {
  return value == null ? null : String(value);
}

/**
 * Builds power rows for a container.
 * Feeders are children of container with power ports, sorted by name.
 * inCell/outCell: first port with direction 'IN'/'OUT' respectively (port data field, not role branching).
 * 3-tier peer resolution via shared helper: local effective -> saved refs -> null.
 * switchState: fieldValues stringified or null.
 * inCell.values: IN 케이블의 specParams 그대로.
 */
export function buildPowerRows(
  container: V2Asset,
  assets: V2Asset[],
  cables: V2Cable[],
  /** 컨테이너 명세가 선언한 회로 수 — 주면 빈 자리도 행으로 만든다(패널 스케줄). */
  slotCount?: number | null,
  /** 이 표가 다루는 컨테이너. 같은 함체의 **다른** 컨테이너 자식은 섞이면 안 된다
   *  (자리 번호는 컨테이너마다 1부터 다시 시작한다). */
  containerKey?: string | null,
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
        (containerKey === undefined || a.containerKey === containerKey) &&
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
      slotNo: feeder.slotIndex != null ? feeder.slotIndex + 1 : null,
      empty: false,
      feederId: feeder.id,
      feederName: feeder.name,
      switchState: fieldString(feeder.fieldValues?.switchState),
      inCell,
      outCell,
    });
  }

  /* 빈 회로 자리 — 패널 스케줄은 쓰지 않는 자리도 보여준다(SPARE).
     "12회로 분전반에 지금 3개만 물려 있다" 를 보려면 빈 자리가 행으로 있어야 한다.
     회로 수는 컨테이너 명세가 선언한 slotCount 다 — 자유형(null)이면 있는 것만 나열한다. */
  if (slotCount != null) {
    const taken = new Set(rows.map((r) => r.slotNo).filter((n): n is number => n != null));
    for (let i = 1; i <= slotCount; i++) {
      if (taken.has(i)) continue;
      rows.push({
        slotNo: i,
        empty: true,
        feederId: '',
        feederName: '',
        switchState: null,
        inCell: { portId: null, cableId: null, peer: null, values: {} },
        outCell: { portId: null, cableId: null, peer: null },
      });
    }
    rows.sort((a, b) => (a.slotNo ?? 0) - (b.slotNo ?? 0));
  }

  return rows;
}
