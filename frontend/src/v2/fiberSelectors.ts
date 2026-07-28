import type { V2Asset, V2Cable } from './types';

export const FIBER_MEDIUM = 'fiber';

/**
 * Returns assets that have at least one child with fiber ports.
 * Results are sorted by name.
 */
export function fiberContainers(assets: V2Asset[]): V2Asset[] {
  const assetMap = new Map(assets.map((a) => [a.id, a]));
  const containerIds = new Set<string>();

  for (const asset of assets) {
    // Find all children (assets whose parentAssetId is this asset's id)
    const children = assets.filter((a) => a.parentAssetId === asset.id);

    // Check if any child has fiber ports
    const hasFiberChild = children.some((child) =>
      child.ports.some((p) => p.medium === FIBER_MEDIUM)
    );

    if (hasFiberChild) {
      containerIds.add(asset.id);
    }
  }

  const result = Array.from(containerIds)
    .map((id) => assetMap.get(id)!)
    .sort((a, b) => a.name.localeCompare(b.name));

  return result;
}

export interface FiberRowCell {
  group: string;
  portId: string | null;
  portName: string | null;
  cableId: string | null;
  peer:
    | {
        assetName: string;
        portName: string;
        substationName: string | null;
        remote: boolean;
      }
    | null;
}

export interface FiberRowMeta {
  cableId: string | null;
  lengthM: number | null;
  lossDb: number | null;
  inspectedAt: string | null;
}

export interface FiberRow {
  slotId: string;
  slotName: string;
  coreIndex: number;
  cells: FiberRowCell[];
  meta: FiberRowMeta;
}

export interface BuildFiberRowsResult {
  groups: string[];
  rows: FiberRow[];
}

/**
 * Builds fiber rows for a container.
 * Groups are the union of all fiber port groups from slots (in port order).
 * Rows are generated for each slot × coreIndex (1..max index per group).
 * Cells resolve peer from local effective -> saved refs -> null.
 * Meta contains spec params from the last group's cable.
 */
export function buildFiberRows(
  container: V2Asset,
  assets: V2Asset[],
  cables: V2Cable[]
): BuildFiberRowsResult {
  const assetMap = new Map(assets.map((a) => [a.id, a]));
  const cablesByAPortId = new Map<string, V2Cable>();
  const cablesByBPortId = new Map<string, V2Cable>();

  for (const cable of cables) {
    cablesByAPortId.set(cable.aPortId, cable);
    cablesByBPortId.set(cable.bPortId, cable);
  }

  // Step 1: Find slots = children of container with fiber ports, sorted by name
  const slots = assets
    .filter((a) => a.parentAssetId === container.id && a.ports.some((p) => p.medium === FIBER_MEDIUM))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Step 2: Collect all fiber port groups from slots (preserve port order)
  const groupsSet = new Set<string>();
  const groupsOrder: string[] = [];

  for (const slot of slots) {
    const fiberPorts = slot.ports.filter((p) => p.medium === FIBER_MEDIUM);
    for (const port of fiberPorts) {
      if (!groupsSet.has(port.group)) {
        groupsSet.add(port.group);
        groupsOrder.push(port.group);
      }
    }
  }

  // Step 3.5: Build portId → { port, asset } index once (hoisted — replaces per-cell flatMap)
  const portIndex = new Map<string, { port: V2Asset['ports'][number] & { assetId: string }; asset: V2Asset }>();
  for (const a of assets) {
    for (const p of a.ports) {
      portIndex.set(p.id, { port: { ...p, assetId: a.id }, asset: a });
    }
  }

  // Step 3.6: Build per-slot max coreIndex (item 3 — slot-level max, not global max)
  const maxCoreIndexBySlot = new Map<string, number>();
  for (const slot of slots) {
    let slotMax = 0;
    for (const p of slot.ports) {
      if (p.medium === FIBER_MEDIUM) slotMax = Math.max(slotMax, p.index);
    }
    maxCoreIndexBySlot.set(slot.id, slotMax);
  }

  // Step 4: Build rows: slot × coreIndex (1..slotMax per slot)
  const rows: FiberRow[] = [];

  for (const slot of slots) {
    const slotMaxCoreIndex = maxCoreIndexBySlot.get(slot.id) ?? 0;
    for (let coreIndex = 1; coreIndex <= slotMaxCoreIndex; coreIndex++) {
      const cells: FiberRowCell[] = [];
      const cableByGroupIdx: (V2Cable | null)[] = [];

      // Build cells for each group in order
      for (let groupIdx = 0; groupIdx < groupsOrder.length; groupIdx++) {
        const group = groupsOrder[groupIdx];
        const port = slot.ports.find(
          (p) => p.medium === FIBER_MEDIUM && p.group === group && p.index === coreIndex
        );

        let cable: V2Cable | null = null;
        let peer: FiberRowCell['peer'] = null;

        if (port) {
          // Try to find cable connected to this port
          cable = cablesByAPortId.get(port.id) || cablesByBPortId.get(port.id) || null;

          if (cable) {
            // Determine which end is the peer (the other end of the cable)
            const otherPortId = cable.aPortId === port.id ? cable.bPortId : cable.aPortId;
            // Use hoisted portIndex instead of per-cell flatMap
            const entry = portIndex.get(otherPortId);
            const otherPort = entry?.port;

            if (otherPort) {
              // Local effective peer found
              const peerAsset = assetMap.get(otherPort.assetId);
              if (peerAsset) {
                peer = {
                  assetName: peerAsset.name,
                  portName: otherPort.name,
                  substationName: null,
                  remote: false,
                };
              }
            } else if (cable.aPortId === port.id && cable.bRef) {
              // Use bRef
              peer = {
                assetName: cable.bRef.assetName,
                portName: cable.bRef.portName,
                substationName: cable.bRef.substationName ?? null,
                remote: cable.bRef.substationId !== container.substationId,
              };
            } else if (cable.bPortId === port.id && cable.aRef) {
              // Use aRef
              peer = {
                assetName: cable.aRef.assetName,
                portName: cable.aRef.portName,
                substationName: cable.aRef.substationName ?? null,
                remote: cable.aRef.substationId !== container.substationId,
              };
            }
          }

          cells.push({
            group,
            portId: port.id,
            portName: port.name,
            cableId: cable?.id ?? null,
            peer,
          });

          cableByGroupIdx[groupIdx] = cable;
        } else {
          cells.push({
            group,
            portId: null,
            portName: null,
            cableId: null,
            peer: null,
          });
          cableByGroupIdx[groupIdx] = null;
        }
      }

      // Build meta: prefer last group cable, fall back to first non-null cable in reverse order
      let metaCable: V2Cable | null = null;
      for (let gi = groupsOrder.length - 1; gi >= 0; gi--) {
        if (cableByGroupIdx[gi]) {
          metaCable = cableByGroupIdx[gi]!;
          break;
        }
      }

      const meta: FiberRowMeta = {
        cableId: metaCable?.id ?? null,
        lengthM: (metaCable?.specParams?.lengthM as number | null) ?? null,
        lossDb: (metaCable?.specParams?.lossDb as number | null) ?? null,
        inspectedAt: (metaCable?.specParams?.inspectedAt as string | null) ?? null,
      };

      rows.push({
        slotId: slot.id,
        slotName: slot.name,
        coreIndex,
        cells,
        meta,
      });
    }
  }

  return {
    groups: groupsOrder,
    rows,
  };
}
