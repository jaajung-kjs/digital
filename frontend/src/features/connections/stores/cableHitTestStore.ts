import { create } from 'zustand';

interface CableHitEntry {
  id: string;
  pathPoints: [number, number][];
}

interface CableHitTestState {
  cables: CableHitEntry[];
  setCables: (cables: CableHitEntry[]) => void;
}

/**
 * Lightweight store holding cable pathPoints for hit testing.
 * Populated by ConnectionOverlay, consumed by useCanvasEvents.
 */
export const useCableHitTestStore = create<CableHitTestState>((set) => ({
  cables: [],
  setCables: (cables) => set({ cables }),
}));

/** Minimum distance from a point to a polyline for hit testing */
export function pointToPolylineDistance(px: number, py: number, points: [number, number][]): number {
  let minDist = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const dist = Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}
