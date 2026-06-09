import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
vi.mock('../../utils/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
import { api } from '../../utils/api';
import { useSubstationWorkingCopy } from './substationStore';
import { useEffectiveCables, useWorkingCopyDirty, useEffectiveEquipment } from './hooks';

const cable = { id: 'c1', cableType: 'LAN', updatedAt: '2026-01-01T00:00:00.000Z' };
const TS = '2026-01-01T00:00:00.000Z';
const assets = [
  // f1 placement-level rack
  { id: 'r1', name: 'r1', floorId: 'f1', assetType: { placementKind: 'RACK' }, positionX: 10, positionY: 20, parentAssetId: null, slotIndex: null, updatedAt: TS },
  // f1 placement-level ofd
  { id: 'o1', name: 'o1', floorId: 'f1', assetType: { placementKind: 'OFD' }, positionX: 30, positionY: 40, parentAssetId: null, slotIndex: null, updatedAt: TS },
  // f1 rack-module child (excluded)
  { id: 'm1', name: 'm1', floorId: 'f1', parentAssetId: 'r1', slotIndex: 3, updatedAt: TS },
  // other floor (excluded)
  { id: 'x1', name: 'x1', floorId: 'f2', assetType: { placementKind: 'OFD' }, parentAssetId: null, slotIndex: null, updatedAt: TS },
];
beforeEach(() => {
  (api.get as any).mockResolvedValue({
    data: { data: { assets, cables: [cable], distributionCircuits: [], fiberPaths: [] } },
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

  it('useEffectiveEquipment(f1) → f1 placement-level only, as FloorPlanEquipment', async () => {
    await act(async () => {
      await useSubstationWorkingCopy.getState().load('s1');
    });
    const { result, rerender } = renderHook(() => useEffectiveEquipment('f1'));
    expect(result.current.map((e: any) => e.id).sort()).toEqual(['o1', 'r1']); // m1 (rack module) + x1 (other floor) excluded
    expect(result.current.find((e: any) => e.id === 'r1')!.kind).toBe('RACK');
    const ref1 = result.current;
    rerender();
    expect(result.current).toBe(ref1); // stable ref when nothing changed
  });
});
