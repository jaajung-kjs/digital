import type { SeededMediumKey } from '@twin/core';
import { buildPortIndex, indexCablesByPort, mediumContainers, resolvePeer, type PeerInfo } from './peerResolve';
import type { V2Asset, V2AssetType, V2Cable } from './types';

export const FIBER_MEDIUM: SeededMediumKey = 'fiber';

/**
 * Returns assets that have at least one child with fiber ports.
 * Results are sorted by name.
 */
export function fiberContainers(assets: V2Asset[]): V2Asset[] {
  return mediumContainers(assets, FIBER_MEDIUM);
}

export interface FiberRowCell {
  group: string;
  portId: string | null;
  portName: string | null;
  cableId: string | null;
  peer: PeerInfo | null;
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
 * Meta contains spec params from the DECLARED lineSide group's cable (PortTemplate.lineSide===true).
 * If no lineSide group is declared, or the lineSide group has no cable for that core, meta.cableId===null.
 */
export function buildFiberRows(
  container: V2Asset,
  assets: V2Asset[],
  cables: V2Cable[],
  types: V2AssetType[],
): BuildFiberRowsResult {
  const { cablesByAPortId, cablesByBPortId } = indexCablesByPort(cables);

  // Pre-build: typeId → lineSide group name (declared, ≤1 per type)
  const lineSideGroupByTypeId = new Map<string, string>();
  for (const t of types) {
    const lineSidePort = t.portTemplates.find((p) => p.lineSide === true);
    if (lineSidePort) lineSideGroupByTypeId.set(t.id, lineSidePort.group);
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

  // Step 3.5: Build portId → { port, asset } index once (hoisted — shared helper)
  const portIndex = buildPortIndex(assets);

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
            // 3-tier peer resolution — shared helper (local → saved refs → null)
            peer = resolvePeer(port, cable, portIndex, container.substationId);
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

      // Build meta: DECLARED lineSide group's cable only — no positional fallback.
      // If no lineSide group declared for this slot's type, or that group has no cable
      // for this core index → meta.cableId === null (MetaInput shows "—" disabled).
      const lineSideGroup = lineSideGroupByTypeId.get(slot.typeId);
      const lineSideGroupIdx = lineSideGroup !== undefined ? groupsOrder.indexOf(lineSideGroup) : -1;
      const metaCable: V2Cable | null =
        lineSideGroupIdx >= 0 ? (cableByGroupIdx[lineSideGroupIdx] ?? null) : null;

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
