import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
vi.mock('../../utils/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
import { api } from '../../utils/api';
import { useSubstationWorkingCopy } from './substationStore';
import { useEffectiveCables, useWorkingCopyDirty, useEffectiveEquipment, useEffectiveRackModules, useEffectiveFloorCables, useUnifiedDirty } from './hooks';
import { useEditorStore } from '../editor/stores/editorStore';

// jsdom 에 없는 URL.revokeObjectURL 스텁(clearPendingData/resetEditor 가 호출).
if (typeof URL.revokeObjectURL !== 'function') {
  (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};
}

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

  it('useUnifiedDirty sums overlay dirty + pendingUploads + pendingLogs + floor settings', async () => {
    await act(async () => {
      await useSubstationWorkingCopy.getState().load('s1');
    });
    useEditorStore.getState().resetEditor();
    const { result, rerender } = renderHook(() => useUnifiedDirty());
    expect(result.current).toBe(0);

    // 1 staged overlay change
    act(() => {
      useSubstationWorkingCopy.getState().stageCableUpdate('c1', { label: 'Z' });
    });
    rerender();
    expect(result.current).toBe(1);

    // + 2 pending uploads
    act(() => {
      useEditorStore.getState().addPendingUpload({
        id: 'u1', equipmentId: 'e1', side: 'front', file: new File([''], 'a.jpg'), description: '', objectUrl: 'blob:a',
      });
      useEditorStore.getState().addPendingUpload({
        id: 'u2', equipmentId: 'e1', side: 'rear', file: new File([''], 'b.jpg'), description: '', objectUrl: 'blob:b',
      });
    });
    rerender();
    expect(result.current).toBe(3);

    // + 1 pending log
    act(() => {
      useEditorStore.getState().addPendingLog({ id: 'l1', equipmentId: 'e1', logType: 'CHECK', title: 't' });
    });
    rerender();
    expect(result.current).toBe(4);

    // + floor settings (staged background opacity) counts as exactly 1
    act(() => {
      useEditorStore.getState().stageBackgroundOpacity(0.5);
    });
    rerender();
    expect(result.current).toBe(5);

    // cleanup so editorStore state doesn't bleed into other tests
    act(() => {
      useEditorStore.getState().resetEditor();
    });
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

  it('useEffectiveRackModules(r1) → only r1 slot children', async () => {
    await act(async () => {
      await useSubstationWorkingCopy.getState().load('s1');
    });
    const { result } = renderHook(() => useEffectiveRackModules('r1'));
    // m1 (parent r1, slotIndex 3) included; o1/r1/x1 (no slotIndex or other parent) excluded.
    expect(result.current.map((a: any) => a.id)).toEqual(['m1']);
  });

  it('useEffectiveFloorCables(f1) → only cables touching f1 assets', async () => {
    // f1: r1, o1, m1 ; f2: x1
    const cables = [
      { id: 'c-f1', source: { equipmentId: 'r1', moduleId: null }, target: { equipmentId: 'o1', moduleId: null }, updatedAt: TS }, // both on f1
      { id: 'c-f2', source: { equipmentId: 'x1', moduleId: null }, target: { equipmentId: null, moduleId: null }, updatedAt: TS }, // x1 on f2
      { id: 'c-mod', source: { equipmentId: null, moduleId: 'm1' }, target: { equipmentId: null, moduleId: null }, updatedAt: TS }, // m1 on f1
    ];
    (api.get as any).mockResolvedValue({
      data: { data: { assets, cables, distributionCircuits: [], fiberPaths: [] } },
    });
    await act(async () => {
      await useSubstationWorkingCopy.getState().load('s1');
    });
    const { result } = renderHook(() => useEffectiveFloorCables('f1'));
    expect(result.current.map((c: any) => c.id).sort()).toEqual(['c-f1', 'c-mod']); // c-f2 excluded (only touches f2)
  });
});
