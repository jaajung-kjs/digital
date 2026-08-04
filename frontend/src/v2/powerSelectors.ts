import type { SeededMediumKey } from '@twin/core';
import { buildPortIndex, indexCablesByPort, mediumContainers, resolvePeer, type PeerInfo } from './peerResolve';
import type { V2Asset, V2Cable } from './types';

export type { PeerInfo } from './peerResolve';

export const POWER_MEDIUM: SeededMediumKey = 'power';

/**
 * Returns assets that have at least one child with power ports.
 * Results are sorted by name.
 */
export function powerContainers(assets: V2Asset[]): V2Asset[] {
  return mediumContainers(assets, POWER_MEDIUM);
}

export interface PowerCell {
  portId: string | null;
  cableId: string | null;
  peer: PeerInfo | null;
}

export interface PowerRow {
  feederId: string;
  feederName: string;
  breakerNo: string | null;
  switchState: string | null;
  inCell: PowerCell & { voltage: string | null };
  outCell: PowerCell;
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
 * breakerNo/switchState: fieldValues stringified or null.
 * voltage: IN cable specParams.voltage or null.
 */
export function buildPowerRows(
  container: V2Asset,
  assets: V2Asset[],
  cables: V2Cable[]
): PowerRow[] {
  const { cablesByAPortId, cablesByBPortId } = indexCablesByPort(cables);

  // Feeders = children of container with power ports, sorted by name
  const feeders = assets
    .filter((a) => a.parentAssetId === container.id && a.ports.some((p) => p.medium === POWER_MEDIUM))
    .sort((a, b) => a.name.localeCompare(b.name));

  // portId → { port, asset } index (hoisted — shared helper)
  const portIndex = buildPortIndex(assets);

  const rows: PowerRow[] = [];

  for (const feeder of feeders) {
    // First IN / OUT power ports (direction is port data, not a role branch)
    const inPort = feeder.ports.find((p) => p.medium === POWER_MEDIUM && p.direction === 'IN');
    const outPort = feeder.ports.find((p) => p.medium === POWER_MEDIUM && p.direction === 'OUT');

    // Resolve inCell
    const inCell: PowerCell & { voltage: string | null } = {
      portId: inPort?.id ?? null,
      cableId: null,
      peer: null,
      voltage: null,
    };

    if (inPort) {
      const inCable = cablesByAPortId.get(inPort.id) || cablesByBPortId.get(inPort.id) || null;
      if (inCable) {
        inCell.cableId = inCable.id;
        inCell.peer = resolvePeer(inPort, inCable, portIndex, container.substationId);
        inCell.voltage = fieldString(inCable.specParams?.voltage);
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
      feederId: feeder.id,
      feederName: feeder.name,
      breakerNo: fieldString(feeder.fieldValues?.breakerNo),
      switchState: fieldString(feeder.fieldValues?.switchState),
      inCell,
      outCell,
    });
  }

  return rows;
}
