import { describe, it, expect } from 'vitest';
import {
  planMove,
  planResize,
  availableSpanAt,
  nextNameFor,
} from './slotGeometry';
import type { RackModuleCategory } from '../../../types/rackModule';
import type { Asset } from '../../../types/asset';

function mod(id: string, slotIndex: number, slotSpan: number, assetTypeId = 'cat', name = id): Asset {
  return {
    id,
    substationId: 's1',
    assetTypeId,
    assetType: { role: 'rack' } as Asset['assetType'],
    name,
    parentAssetId: 'rack',
    floorId: null,
    roomText: null,
    sourcePresetId: null,
    installDate: null,
    manager: null,
    description: null,
    status: null,
    sortOrder: slotIndex,
    updatedAt: '',
    slotIndex,
    slotSpan,
  };
}

describe('planMove', () => {
  it('accepts move to empty area', () => {
    const result = planMove(mod('A', 0, 2), [mod('B', 5, 2)], 2);
    expect(result.rejected).toBe(false);
    expect(result.affected).toEqual([{ id: 'A', slotIndex: 2, slotSpan: 2 }]);
  });

  it('rejects move that overlaps another module', () => {
    const result = planMove(mod('A', 0, 2), [mod('B', 5, 2)], 4);
    expect(result.rejected).toBe(true);
    expect(result.affected).toEqual([]);
  });

  it('rejects move past slot 12 boundary', () => {
    const result = planMove(mod('A', 0, 2), [], 11);
    expect(result.rejected).toBe(true);
  });

  it('allows moving to slot 10 with span 2 (last position)', () => {
    const result = planMove(mod('A', 0, 2), [], 10);
    expect(result.rejected).toBe(false);
  });
});

describe('planResize', () => {
  it('grows into empty space', () => {
    const result = planResize(mod('A', 0, 2), [], 4);
    expect(result.rejected).toBe(false);
    expect(result.affected).toEqual([{ id: 'A', slotIndex: 0, slotSpan: 4 }]);
  });

  it('compresses adjacent neighbor when growing by 1', () => {
    const result = planResize(mod('A', 0, 2), [mod('B', 2, 2)], 3);
    expect(result.rejected).toBe(false);
    expect(result.affected).toEqual([
      { id: 'A', slotIndex: 0, slotSpan: 3 },
      { id: 'B', slotIndex: 3, slotSpan: 1 },
    ]);
  });

  it('rejects when neighbor would have to be <1 slot', () => {
    const result = planResize(mod('A', 0, 2), [mod('B', 2, 1)], 3);
    expect(result.rejected).toBe(true);
  });

  it('shrinks without affecting neighbors', () => {
    const result = planResize(mod('A', 0, 4), [mod('B', 4, 2)], 2);
    expect(result.rejected).toBe(false);
    expect(result.affected).toEqual([{ id: 'A', slotIndex: 0, slotSpan: 2 }]);
  });

  it('rejects growth past slot 12', () => {
    const result = planResize(mod('A', 10, 1), [], 4);
    expect(result.rejected).toBe(true);
  });
});

describe('availableSpanAt', () => {
  it('returns 12 for empty rack at slot 0', () => {
    expect(availableSpanAt([], 0)).toBe(12);
  });

  it('returns space until next module', () => {
    expect(availableSpanAt([mod('A', 5, 2)], 2)).toBe(3);
  });

  it('returns 0 when clicked slot itself is occupied', () => {
    expect(availableSpanAt([mod('A', 5, 2)], 5)).toBe(0);
  });

  it('returns slots until rack end when no module below', () => {
    expect(availableSpanAt([mod('A', 0, 2)], 9)).toBe(3);
  });
});

describe('nextNameFor', () => {
  const cat: Pick<RackModuleCategory, 'id' | 'name'> = { id: 'cat-sw', name: '스위치' };

  it('returns base-1 when no modules', () => {
    expect(nextNameFor([], cat)).toBe('스위치-1');
  });

  it('returns next number after existing', () => {
    const modules = [
      mod('A', 0, 1, 'cat-sw', '스위치-1'),
      mod('B', 1, 1, 'cat-sw', '스위치-3'),
    ];
    expect(nextNameFor(modules, cat)).toBe('스위치-4');
  });

  it('escapes regex special chars in category name', () => {
    const c = { id: 'c', name: 'A+B' };
    expect(nextNameFor([], c)).toBe('A+B-1');
  });

  it('ignores modules of other categories', () => {
    const modules = [mod('X', 0, 1, 'cat-other', '스위치-5')];
    expect(nextNameFor(modules, cat)).toBe('스위치-1');
  });
});
