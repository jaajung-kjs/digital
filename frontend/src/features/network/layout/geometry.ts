/**
 * Shared geometry constants and helpers for network topology layouts.
 *
 * Single source of truth for box dimensions / spacing so BC-tree and SPQR layouts
 * stay in lockstep (the dispatcher in NetworkTopologyModal picks one based on
 * cycleDetection's output — they must agree on edge length to compose cleanly).
 */

export const BOX_W = 200;
export const NODE_GAP = 80;
export const LEAF_GAP = 220;
export const BRIDGE_GAP = 240;

/** Regular N-gon radius: 인접 노드 chord = BOX_W + NODE_GAP. */
export function ringRadius(N: number): number {
  if (N < 3) return BOX_W;
  return (BOX_W + NODE_GAP) / (2 * Math.sin(Math.PI / N));
}
