import type { TraceNode, TraceEdge } from '../types';

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
  viewBox: { width: number; height: number };
}

const NODE_WIDTH = 120;
const NODE_HEIGHT = 36;
const NODE_GAP = 16;
const SUBSTATION_PADDING = 24;
const SUBSTATION_HEADER = 32;
const SUBSTATION_GAP = 60;
const COLS = 3;

export function computeLayout(nodes: TraceNode[], _edges: TraceEdge[]): LayoutResult {
  // Group nodes by substationId
  const groups = new Map<string, { name: string; nodes: TraceNode[] }>();
  for (const node of nodes) {
    const key = node.substationId || 'unknown';
    if (!groups.has(key)) {
      groups.set(key, { name: node.substationName || '알 수 없음', nodes: [] });
    }
    groups.get(key)!.nodes.push(node);
  }

  const substations: LayoutSubstation[] = [];
  const groupEntries = Array.from(groups.entries());

  // Each substation varies in size, so compute row heights properly
  // First pass: compute each substation box size
  const boxSizes: Array<{ width: number; height: number }> = [];

  for (const [, { nodes: groupNodes }] of groupEntries) {
    const nodesPerRow = Math.min(groupNodes.length, 3);
    const rows = Math.ceil(groupNodes.length / nodesPerRow);
    const innerWidth = nodesPerRow * NODE_WIDTH + (nodesPerRow - 1) * NODE_GAP;
    const innerHeight = rows * NODE_HEIGHT + (rows - 1) * NODE_GAP;
    boxSizes.push({
      width: innerWidth + SUBSTATION_PADDING * 2,
      height: innerHeight + SUBSTATION_HEADER + SUBSTATION_PADDING * 2,
    });
  }

  // Second pass: position substations in grid
  // Track max height per grid row for proper vertical alignment
  const rowHeights = new Map<number, number>();
  const rowWidths = new Map<number, number[]>();

  for (let i = 0; i < boxSizes.length; i++) {
    const row = Math.floor(i / COLS);
    const currentMax = rowHeights.get(row) ?? 0;
    rowHeights.set(row, Math.max(currentMax, boxSizes[i].height));
    if (!rowWidths.has(row)) rowWidths.set(row, []);
    rowWidths.get(row)!.push(boxSizes[i].width);
  }

  for (let i = 0; i < groupEntries.length; i++) {
    const [substationId, { name, nodes: groupNodes }] = groupEntries[i];
    const col = i % COLS;
    const row = Math.floor(i / COLS);

    // Compute x: sum of previous columns' max widths + gaps
    let sx = 0;
    for (let c = 0; c < col; c++) {
      // Find max width in this column across all rows
      let maxColWidth = 0;
      for (let r = 0; r <= rowHeights.size - 1; r++) {
        const rowW = rowWidths.get(r);
        if (rowW && rowW[c]) maxColWidth = Math.max(maxColWidth, rowW[c]);
      }
      sx += maxColWidth + SUBSTATION_GAP;
    }

    // Compute y: sum of previous rows' heights + gaps
    let sy = 0;
    for (let r = 0; r < row; r++) {
      sy += (rowHeights.get(r) ?? 0) + SUBSTATION_GAP;
    }

    const { width: boxWidth, height: boxHeight } = boxSizes[i];
    const nodesPerRow = Math.min(groupNodes.length, 3);

    const layoutNodes: LayoutNode[] = groupNodes.map((n, j) => {
      const nc = j % nodesPerRow;
      const nr = Math.floor(j / nodesPerRow);
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
      substationId,
      substationName: name,
      x: sx,
      y: sy,
      width: boxWidth,
      height: boxHeight,
      nodes: layoutNodes,
    });
  }

  let maxX = 0;
  let maxY = 0;
  for (const s of substations) {
    maxX = Math.max(maxX, s.x + s.width);
    maxY = Math.max(maxY, s.y + s.height);
  }

  return {
    substations,
    viewBox: { width: maxX + 40, height: maxY + 40 },
  };
}
