import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
vi.mock('../../utils/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
import { api } from '../../utils/api';
import { useSubstationWorkingCopy } from './substationStore';
import { useEffectiveCables, useWorkingCopyDirty } from './hooks';

const cable = { id: 'c1', cableType: 'LAN', updatedAt: '2026-01-01T00:00:00.000Z' };
beforeEach(() => {
  (api.get as any).mockResolvedValue({
    data: { data: { assets: [], cables: [cable], distributionCircuits: [], fiberPaths: [] } },
  });
});

describe('workingCopy hooks', () => {
  it('useEffectiveCables reflects saved + stage', async () => {
    await act(async () => {
      await useSubstationWorkingCopy.getState().load('s1');
    });
    const { result, rerender } = renderHook(() => useEffectiveCables());
    expect(result.current.map((c: any) => c.id)).toEqual(['c1']);
    act(() => {
      useSubstationWorkingCopy.getState().stageCableUpdate('c1', { label: 'X' });
    });
    rerender();
    expect(result.current.find((c: any) => c.id === 'c1').label).toBe('X');
  });

  it('useWorkingCopyDirty counts staged changes', async () => {
    await act(async () => {
      await useSubstationWorkingCopy.getState().load('s1');
    });
    const { result, rerender } = renderHook(() => useWorkingCopyDirty());
    expect(result.current).toBe(0);
    act(() => {
      useSubstationWorkingCopy.getState().stageCableUpdate('c1', { label: 'Y' });
    });
    rerender();
    expect(result.current).toBe(1);
  });
});
