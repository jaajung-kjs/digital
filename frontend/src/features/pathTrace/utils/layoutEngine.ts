import type { TraceNode, TraceEdge, TraceRing } from '../types';

export interface LayoutNode {
  equipmentId: string;
  equipmentName: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutSubstation {
  substationId: string;
  substationName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  nodes: LayoutNode[];
}

export interface LayoutResult {
  substations: LayoutSubstation[];
}

// ── Constants ──────────────────────────────────────────
const NODE_WIDTH = 120;
const NODE_HEIGHT = 36;
const NODE_GAP = 16;
const SUBSTATION_PADDING = 24;
const SUBSTATION_HEADER = 32;
const SUBSTATION_GAP = 60;
const GRID_COLS = 3;

// ── Main entry point ───────────────────────────────────

export function computeLayout(
  nodes: TraceNode[],
  edges: TraceEdge[] = [],
  rings: TraceRing[] = [],
): LayoutResult {
  const groups = groupBySubstation(nodes);
  const boxSizes = computeBoxSizes(groups);

  const fundamentalRings = rings.filter((r) => r.level === 0);
  if (fundamentalRings.length === 0 || edges.length === 0) {
    return gridLayout(groups, boxSizes);
  }

  // Equipment → substation mapping
  const equipToSub = new Map<string, string>();
  for (const n of nodes) {
    equipToSub.set(n.equipmentId, n.substationId || 'unknown');
  }

  // Get ordered substations per ring
  const ringOrders = new Map<string, string[]>();
  for (const ring of fundamentalRings) {
    const order = getRingSubstationOrder(ring, edges, equipToSub);
    if (order.length >= 3) ringOrders.set(ring.id, order);
  }

  if (ringOrders.size === 0) {
    return gridLayout(groups, boxSizes);
  }

  // Substation → ring membership
  const subToRings = new Map<string, string[]>();
  for (const [ringId, subs] of ringOrders) {
    for (const s of subs) {
      if (!subToRings.has(s)) subToRings.set(s, []);
      subToRings.get(s)!.push(ringId);
    }
  }

  // Position ring substations on circles
  const positions = new Map<string, { cx: number; cy: number }>();
  placeRingsOnCircles(ringOrders, subToRings, boxSizes, positions);

  // Collect ring-placed substations
  const placedSubs = new Set(positions.keys());

  // Position non-ring substations adjacent to their connected ring node
  placeNonRingSubstations(groups, boxSizes, positions, placedSubs, edges, equipToSub);

  return buildResult(groups, boxSizes, positions);
}

// ── Substation grouping & sizing ───────────────────────

function groupBySubstation(nodes: TraceNode[]) {
  const groups = new Map<string, { name: string; nodes: TraceNode[] }>();
  for (const node of nodes) {
    const key = node.substationId || 'unknown';
    if (!groups.has(key)) {
      groups.set(key, { name: node.substationName || '알 수 없음', nodes: [] });
    }
    groups.get(key)!.nodes.push(node);
  }
  return groups;
}

function computeBoxSizes(groups: Map<string, { name: string; nodes: TraceNode[] }>) {
  const sizes = new Map<string, { width: number; height: number }>();
  for (const [subId, { nodes: groupNodes }] of groups) {
    const perRow = Math.min(groupNodes.length, 3);
    const rows = Math.ceil(groupNodes.length / perRow);
    sizes.set(subId, {
      width: perRow * NODE_WIDTH + (perRow - 1) * NODE_GAP + SUBSTATION_PADDING * 2,
      height: rows * NODE_HEIGHT + (rows - 1) * NODE_GAP + SUBSTATION_HEADER + SUBSTATION_PADDING * 2,
    });
  }
  return sizes;
}

// ── Ring substation ordering ───────────────────────────

/**
 * Extract the cycle order of substations from a ring's edges.
 * Returns substationIds in traversal order around the cycle.
 */
function getRingSubstationOrder(
  ring: TraceRing,
  edges: TraceEdge[],
  equipToSub: Map<string, string>,
): string[] {
  const edgeSet = new Set(ring.edgeIds);
  const adj = new Map<string, Set<string>>();

  for (const edge of edges) {
    if (!edgeSet.has(edge.id)) continue;
    const src = equipToSub.get(edge.sourceEquipmentId);
    const tgt = equipToSub.get(edge.targetEquipmentId);
    if (!src || !tgt || src === tgt) continue;

    if (!adj.has(src)) adj.set(src, new Set());
    if (!adj.has(tgt)) adj.set(tgt, new Set());
    adj.get(src)!.add(tgt);
    adj.get(tgt)!.add(src);
  }

  if (adj.size < 3) return [];

  // Walk the cycle from an arbitrary start
  const start = adj.keys().next().value!;
  const order: string[] = [start];
  let prev = '';
  let current = start;

  for (let i = 0; i < adj.size - 1; i++) {
    const neighbors = adj.get(current);
    if (!neighbors) break;
    let next: string | undefined;
    for (const n of neighbors) {
      if (n !== prev) { next = n; break; }
    }
    if (!next) break;
    order.push(next);
    prev = current;
    current = next;
  }

  // Normalize: rotate so the smallest substationId is first.
  // This makes layout deterministic regardless of BFS traversal order.
  let minIdx = 0;
  for (let i = 1; i < order.length; i++) {
    if (order[i] < order[minIdx]) minIdx = i;
  }
  if (minIdx > 0) {
    return [...order.slice(minIdx), ...order.slice(0, minIdx)];
  }
  return order;
}

// ── Ring circle placement ──────────────────────────────

function placeRingsOnCircles(
  ringOrders: Map<string, string[]>,
  subToRings: Map<string, string[]>,
  boxSizes: Map<string, { width: number; height: number }>,
  positions: Map<string, { cx: number; cy: number }>,
) {
  // Calculate radius for each ring
  const ringRadii = new Map<string, number>();
  for (const [ringId, subs] of ringOrders) {
    const maxDim = Math.max(
      ...subs.map((s) => {
        const sz = boxSizes.get(s);
        return sz ? Math.max(sz.width, sz.height) : 200;
      }),
    );
    const minSpacing = maxDim + SUBSTATION_GAP;
    const radius = Math.max(200, (subs.length * minSpacing) / (2 * Math.PI));
    ringRadii.set(ringId, radius);
  }

  // Build a chain of rings connected by junctions
  const placed = new Set<string>();
  const ringCenters = new Map<string, { cx: number; cy: number }>();

  // Find junctions between rings
  const junctions = new Map<string, { ring1: string; ring2: string; subId: string }>();
  for (const [subId, ringIds] of subToRings) {
    if (ringIds.length >= 2) {
      junctions.set(`${ringIds[0]}-${ringIds[1]}`, {
        ring1: ringIds[0],
        ring2: ringIds[1],
        subId,
      });
    }
  }

  // Place first ring
  const firstRingId = ringOrders.keys().next().value!;
  const firstRadius = ringRadii.get(firstRingId)!;
  ringCenters.set(firstRingId, { cx: firstRadius + 40, cy: firstRadius + 40 });
  placed.add(firstRingId);

  // Place connected rings via junctions
  let changed = true;
  while (changed) {
    changed = false;
    for (const [, { ring1, ring2, subId }] of junctions) {
      const placedRing = placed.has(ring1) ? ring1 : placed.has(ring2) ? ring2 : null;
      const unplacedRing = placedRing === ring1 ? ring2 : placedRing === ring2 ? ring1 : null;
      if (!placedRing || !unplacedRing || placed.has(unplacedRing)) continue;

      const placedCenter = ringCenters.get(placedRing)!;
      const placedRadius = ringRadii.get(placedRing)!;
      const unplacedRadius = ringRadii.get(unplacedRing)!;
      const placedOrder = ringOrders.get(placedRing)!;

      // Find junction angle on placed ring
      const juncIdx = placedOrder.indexOf(subId);
      const juncAngle = juncIdx >= 0
        ? (2 * Math.PI * juncIdx) / placedOrder.length - Math.PI / 2
        : 0;

      // Junction point on placed ring's circle
      const juncX = placedCenter.cx + placedRadius * Math.cos(juncAngle);
      const juncY = placedCenter.cy + placedRadius * Math.sin(juncAngle);

      // Place unplaced ring so junction is on its circle, opposite side
      const unplacedCenter = {
        cx: juncX + unplacedRadius * Math.cos(juncAngle),
        cy: juncY + unplacedRadius * Math.sin(juncAngle),
      };
      ringCenters.set(unplacedRing, unplacedCenter);
      placed.add(unplacedRing);
      changed = true;
    }
  }

  // Place any disconnected rings that weren't reached
  let offsetX = 0;
  for (const [ringId] of ringOrders) {
    if (placed.has(ringId)) {
      const center = ringCenters.get(ringId)!;
      offsetX = Math.max(offsetX, center.cx + ringRadii.get(ringId)! + SUBSTATION_GAP);
      continue;
    }
    const radius = ringRadii.get(ringId)!;
    ringCenters.set(ringId, { cx: offsetX + radius + 40, cy: radius + 40 });
    placed.add(ringId);
    offsetX += radius * 2 + SUBSTATION_GAP;
  }

  // Now place each substation on its ring's circle
  for (const [ringId, subs] of ringOrders) {
    const center = ringCenters.get(ringId)!;
    const radius = ringRadii.get(ringId)!;

    for (let i = 0; i < subs.length; i++) {
      const subId = subs[i];
      if (positions.has(subId)) continue; // Junction already placed by first ring

      const angle = (2 * Math.PI * i) / subs.length - Math.PI / 2;
      positions.set(subId, {
        cx: center.cx + radius * Math.cos(angle),
        cy: center.cy + radius * Math.sin(angle),
      });
    }
  }
}

// ── Non-ring substations ───────────────────────────────

function placeNonRingSubstations(
  groups: Map<string, { name: string; nodes: TraceNode[] }>,
  boxSizes: Map<string, { width: number; height: number }>,
  positions: Map<string, { cx: number; cy: number }>,
  placedSubs: Set<string>,
  edges: TraceEdge[],
  equipToSub: Map<string, string>,
) {
  // Build substation-level adjacency
  const adj = new Map<string, Set<string>>();
  for (const edge of edges) {
    const src = equipToSub.get(edge.sourceEquipmentId);
    const tgt = equipToSub.get(edge.targetEquipmentId);
    if (!src || !tgt || src === tgt) continue;
    if (!adj.has(src)) adj.set(src, new Set());
    if (!adj.has(tgt)) adj.set(tgt, new Set());
    adj.get(src)!.add(tgt);
    adj.get(tgt)!.add(src);
  }

  const unplaced = [...groups.keys()].filter((s) => !placedSubs.has(s));
  if (unplaced.length === 0) return;

  // Try to place each non-ring substation near a connected ring node
  for (const subId of unplaced) {
    const neighbors = adj.get(subId);
    if (neighbors) {
      const placedNeighbor = [...neighbors].find((n) => positions.has(n));
      if (placedNeighbor) {
        const neighbor = positions.get(placedNeighbor)!;
        const sz = boxSizes.get(subId) ?? { width: 200, height: 100 };
        // Place below the connected ring node
        positions.set(subId, {
          cx: neighbor.cx,
          cy: neighbor.cy + sz.height + SUBSTATION_GAP,
        });
        placedSubs.add(subId);
        continue;
      }
    }
    // Fallback: place in a row below everything
  }

  // Place remaining unplaced substations in a row at the bottom
  let maxY = 0;
  for (const pos of positions.values()) {
    maxY = Math.max(maxY, pos.cy);
  }

  let xOffset = 40;
  for (const subId of unplaced) {
    if (positions.has(subId)) continue;
    const sz = boxSizes.get(subId) ?? { width: 200, height: 100 };
    positions.set(subId, {
      cx: xOffset + sz.width / 2,
      cy: maxY + sz.height + SUBSTATION_GAP * 2,
    });
    xOffset += sz.width + SUBSTATION_GAP;
  }
}

// ── Grid fallback ──────────────────────────────────────

function gridLayout(
  groups: Map<string, { name: string; nodes: TraceNode[] }>,
  boxSizes: Map<string, { width: number; height: number }>,
): LayoutResult {
  const entries = Array.from(groups.entries());
  const positions = new Map<string, { cx: number; cy: number }>();

  // Track column max widths and row max heights
  const colWidths = new Map<number, number>();
  const rowHeights = new Map<number, number>();

  for (let i = 0; i < entries.length; i++) {
    const [subId] = entries[i];
    const sz = boxSizes.get(subId)!;
    const col = i % GRID_COLS;
    const row = Math.floor(i / GRID_COLS);
    colWidths.set(col, Math.max(colWidths.get(col) ?? 0, sz.width));
    rowHeights.set(row, Math.max(rowHeights.get(row) ?? 0, sz.height));
  }

  for (let i = 0; i < entries.length; i++) {
    const [subId] = entries[i];
    const sz = boxSizes.get(subId)!;
    const col = i % GRID_COLS;
    const row = Math.floor(i / GRID_COLS);

    let x = 0;
    for (let c = 0; c < col; c++) x += (colWidths.get(c) ?? 0) + SUBSTATION_GAP;
    let y = 0;
    for (let r = 0; r < row; r++) y += (rowHeights.get(r) ?? 0) + SUBSTATION_GAP;

    positions.set(subId, { cx: x + sz.width / 2, cy: y + sz.height / 2 });
  }

  return buildResult(groups, boxSizes, positions);
}

// ── Build final result ─────────────────────────────────

function buildResult(
  groups: Map<string, { name: string; nodes: TraceNode[] }>,
  boxSizes: Map<string, { width: number; height: number }>,
  positions: Map<string, { cx: number; cy: number }>,
): LayoutResult {
  const substations: LayoutSubstation[] = [];

  // Normalize: shift all positions so minimum is at (20, 20)
  let minX = Infinity;
  let minY = Infinity;
  for (const [subId, pos] of positions) {
    const sz = boxSizes.get(subId) ?? { width: 200, height: 100 };
    minX = Math.min(minX, pos.cx - sz.width / 2);
    minY = Math.min(minY, pos.cy - sz.height / 2);
  }
  const offsetX = 20 - minX;
  const offsetY = 20 - minY;

  for (const [subId, { name, nodes: groupNodes }] of groups) {
    const pos = positions.get(subId);
    if (!pos) continue;
    const sz = boxSizes.get(subId) ?? { width: 200, height: 100 };

    const sx = pos.cx + offsetX - sz.width / 2;
    const sy = pos.cy + offsetY - sz.height / 2;

    const perRow = Math.min(groupNodes.length, 3);
    const layoutNodes: LayoutNode[] = groupNodes.map((n, j) => {
      const nc = j % perRow;
      const nr = Math.floor(j / perRow);
      return {
        equipmentId: n.equipmentId,
        equipmentName: n.equipmentName,
        x: sx + SUBSTATION_PADDING + nc * (NODE_WIDTH + NODE_GAP),
        y: sy + SUBSTATION_HEADER + SUBSTATION_PADDING + nr * (NODE_HEIGHT + NODE_GAP),
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      };
    });

    substations.push({
      substationId: subId,
      substationName: name,
      x: sx,
      y: sy,
      width: sz.width,
      height: sz.height,
      nodes: layoutNodes,
    });
  }

  return { substations };
}
