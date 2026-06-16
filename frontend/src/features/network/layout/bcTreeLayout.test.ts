import { describe, it, expect } from 'vitest';
import { computeLayoutBCTree } from './bcTreeLayout';
import type { TraceEdge, TraceRing } from '../../pathTrace/types';

const fp = (id: string, s: string, t: string): TraceEdge => ({ id, sourceAssetId: s, targetAssetId: t, type: 'fiberPath' });
const ring = (id: string, nodeIds: string[], edgeIds: string[]): TraceRing => ({ id, label: id, nodeIds, edgeIds, level: 0, childRingIds: [] });

const minPairDist = (pos: Map<string, { x: number; y: number }>): number => {
  const arr = [...pos.values()];
  let m = Infinity;
  for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) m = Math.min(m, Math.hypot(arr[i].x - arr[j].x, arr[i].y - arr[j].y));
  return m;
};

describe('computeLayoutBCTree', () => {
  it('cut-vertex(2 ring) + gap 보다 많은 leaf-bridge → leaf 가 정확히 겹치지 않는다', () => {
    // B 는 R1·R2 두 ring 공유 cut vertex (ringCount=2 → gap 2개). 거기에 leaf 3개 →
    // idx%ringCount wrap 으로 L1·L3 가 같은 방향에 쌓이던 잠재 버그.
    const nodeIds = ['A', 'B', 'C', 'D', 'E', 'L1', 'L2', 'L3'];
    const ofdToGroup = new Map(nodeIds.map((n) => [n, n]));
    const edges = [
      fp('ab', 'A', 'B'), fp('bc', 'B', 'C'), fp('ca', 'C', 'A'),       // R1
      fp('bd', 'B', 'D'), fp('de', 'D', 'E'), fp('eb', 'E', 'B'),       // R2
      fp('bl1', 'B', 'L1'), fp('bl2', 'B', 'L2'), fp('bl3', 'B', 'L3'), // cut vertex B 의 leaf 3개
    ];
    const rings = [ring('R1', ['A', 'B', 'C'], ['ab', 'bc', 'ca']), ring('R2', ['B', 'D', 'E'], ['bd', 'de', 'eb'])];
    const pos = computeLayoutBCTree({ nodeIds, ofdToGroup, edges, rings });
    expect(pos.size).toBe(nodeIds.length);
    expect(minPairDist(pos)).toBeGreaterThan(1); // 어떤 두 노드도 겹치지 않음
  });
});
