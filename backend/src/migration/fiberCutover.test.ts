import { describe, it, expect } from 'vitest';
import { planFiberCutover } from './fiberCutover.js';

describe('planFiberCutover', () => {
  it('마이그레이션 OUT 의 __fromCableId 옛 케이블 + 모든 FiberPath 삭제 대상', () => {
    const migratedOut = [
      { id: 'out1', specParams: { __migration: 'fiberToSlots', __fromCableId: 'oldC1' } },
      { id: 'out2', specParams: { __migration: 'fiberToSlots', __fromCableId: 'oldC2' } },
      { id: 'out3', specParams: { __migration: 'fiberToSlots' } }, // __fromCableId 없음 → 무시
    ];
    const fiberPaths = [{ id: 'fp1' }, { id: 'fp2' }];
    const plan = planFiberCutover(migratedOut, fiberPaths);
    expect(plan.oldCableIds.sort()).toEqual(['oldC1', 'oldC2']);
    expect(plan.fiberPathIds.sort()).toEqual(['fp1', 'fp2']);
  });

  it('중복 __fromCableId 는 한 번만', () => {
    const plan = planFiberCutover(
      [{ id: 'a', specParams: { __migration: 'fiberToSlots', __fromCableId: 'x' } },
       { id: 'b', specParams: { __migration: 'fiberToSlots', __fromCableId: 'x' } }],
      [],
    );
    expect(plan.oldCableIds).toEqual(['x']);
  });
});
