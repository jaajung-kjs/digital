import { create } from 'zustand';
import { distanceToLineSegment } from '../../../utils/geometry/geometryUtils';

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
    const dist = distanceToLineSegment(px, py, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]);
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}
