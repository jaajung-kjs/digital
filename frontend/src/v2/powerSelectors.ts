import type { V2Asset, V2Cable } from './types';

export const POWER_MEDIUM = 'power';

/**
 * Returns assets that have at least one child with power ports.
 * Results are sorted by name.
 */
export function powerContainers(assets: V2Asset[]): V2Asset[] {
  const assetMap = new Map(assets.map((a) => [a.id, a]));
  const containerIds = new Set<string>();

  for (const asset of assets) {
    // Find all children (assets whose parentAssetId is this asset's id)
    const children = assets.filter((a) => a.parentAssetId === asset.id);

    // Check if any child has power ports
    const hasPowerChild = children.some((child) =>
      child.ports.some((p) => p.medium === POWER_MEDIUM)
    );

    if (hasPowerChild) {
      containerIds.add(asset.id);
    }
  }

  const result = Array.from(containerIds)
    .map((id) => assetMap.get(id)!)
    .sort((a, b) => a.name.localeCompare(b.name));

  return result;
}

export interface PeerInfo {
  assetName: string;
  portName?: string;
  substationName: string | null;
  remote: boolean;
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

/**
 * Builds power rows for a container.
 * Feeders are children of container with power ports, sorted by name.
 * inCell/outCell: first port with direction 'IN'/'OUT' respectively.
 * 3-tier peer resolution: local effective -> saved refs -> null.
 * breakerNo/switchState: fieldValues strings or null.
 * voltage: IN cable specParams.voltage or null.
 */
export function buildPowerRows(
  container: V2Asset,
  assets: V2Asset[],
  cables: V2Cable[]
): PowerRow[] {
  const assetMap = new Map(assets.map((a) => [a.id, a]));
  const cablesByAPortId = new Map<string, V2Cable>();
  const cablesByBPortId = new Map<string, V2Cable>();

  for (const cable of cables) {
    cablesByAPortId.set(cable.aPortId, cable);
    cablesByBPortId.set(cable.bPortId, cable);
  }

  // Step 1: Find feeders = children of container with power ports, sorted by name
  const feeders = assets
    .filter((a) => a.parentAssetId === container.id && a.ports.some((p) => p.medium === POWER_MEDIUM))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Step 2: Build portId → { port, asset } index (hoisted for efficiency)
  const portIndex = new Map<string, { port: V2Asset['ports'][number] & { assetId: string }; asset: V2Asset }>();
  for (const a of assets) {
    for (const p of a.ports) {
      portIndex.set(p.id, { port: { ...p, assetId: a.id }, asset: a });
    }
  }

  // Helper: resolve peer from 3-tier logic (local -> refs -> null)
  const resolvePeer = (cable: V2Cable, port: V2Asset['ports'][number]): PeerInfo | null => {
    // Determine which end is the peer
    const otherPortId = cable.aPortId === port.id ? cable.bPortId : cable.aPortId;
    const entry = portIndex.get(otherPortId);
    const otherPort = entry?.port;

    if (otherPort) {
      // Local effective peer found
      const peerAsset = assetMap.get(otherPort.assetId);
      if (peerAsset) {
        return {
          assetName: peerAsset.name,
          portName: otherPort.name,
          substationName: null,
          remote: false,
        };
      }
    } else if (cable.aPortId === port.id && cable.bRef) {
      // Use bRef
      return {
        assetName: cable.bRef.assetName,
        portName: cable.bRef.portName,
        substationName: cable.bRef.substationName ?? null,
        remote: cable.bRef.substationId !== container.substationId,
      };
    } else if (cable.bPortId === port.id && cable.aRef) {
      // Use aRef
      return {
        assetName: cable.aRef.assetName,
        portName: cable.aRef.portName,
        substationName: cable.aRef.substationName ?? null,
        remote: cable.aRef.substationId !== container.substationId,
      };
    }

    return null;
  };

  // Step 3: Build rows
  const rows: PowerRow[] = [];

  for (const feeder of feeders) {
    // Get first IN and OUT ports
    const inPort = feeder.ports.find((p) => p.medium === POWER_MEDIUM && p.direction === 'IN');
    const outPort = feeder.ports.find((p) => p.medium === POWER_MEDIUM && p.direction === 'OUT');

    // Resolve inCell
    let inCell: PowerCell & { voltage: string | null } = {
      portId: null,
      cableId: null,
      peer: null,
      voltage: null,
    };

    if (inPort) {
      const inCable = cablesByAPortId.get(inPort.id) || cablesByBPortId.get(inPort.id) || null;
      if (inCable) {
        inCell.portId = inPort.id;
        inCell.cableId = inCable.id;
        inCell.peer = resolvePeer(inCable, inPort);
        inCell.voltage = (inCable.specParams?.voltage as string | null) ?? null;
      } else {
        inCell.portId = inPort.id;
      }
    }

    // Resolve outCell
    let outCell: PowerCell = {
      portId: null,
      cableId: null,
      peer: null,
    };

    if (outPort) {
      const outCable = cablesByAPortId.get(outPort.id) || cablesByBPortId.get(outPort.id) || null;
      if (outCable) {
        outCell.portId = outPort.id;
        outCell.cableId = outCable.id;
        outCell.peer = resolvePeer(outCable, outPort);
      } else {
        outCell.portId = outPort.id;
      }
    }

    // Get breakerNo and switchState from fieldValues
    const breakerNo = (feeder.fieldValues?.breakerNo as string | null) ?? null;
    const switchState = (feeder.fieldValues?.switchState as string | null) ?? null;

    rows.push({
      feederId: feeder.id,
      feederName: feeder.name,
      breakerNo,
      switchState,
      inCell,
      outCell,
    });
  }

  return rows;
}
