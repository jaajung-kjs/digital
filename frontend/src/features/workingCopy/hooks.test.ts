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
  // f1 placement-level rack (floorAnchor self)
  { id: 'r1', name: 'r1', floorId: 'f1', assetType: { placementKind: 'RACK' }, positionX: 10, positionY: 20, width2d: 40, height2d: 60, parentAssetId: null, slotIndex: null, updatedAt: TS },
  // f1 placement-level ofd
  { id: 'o1', name: 'o1', floorId: 'f1', assetType: { placementKind: 'OFD' }, positionX: 30, positionY: 40, width2d: 40, height2d: 60, parentAssetId: null, slotIndex: null, updatedAt: TS },
  // f1 rack-module child (no coords → floorAnchor walks to r1)
  { id: 'm1', name: 'm1', floorId: 'f1', parentAssetId: 'r1', slotIndex: 3, updatedAt: TS },
  // other floor placement-level ofd (excluded)
  { id: 'x1', name: 'x1', floorId: 'f2', assetType: { placementKind: 'OFD' }, positionX: 5, positionY: 5, width2d: 40, height2d: 60, parentAssetId: null, slotIndex: null, updatedAt: TS },
  // f1 분전반(panel, placed) → feeder(asset) → branch(asset) — 단계3a 통합 노드.
  { id: 'panel1', name: 'panel1', floorId: 'f1', assetType: { placementKind: 'DIST' }, positionX: 70, positionY: 80, width2d: 30, height2d: 30, parentAssetId: null, slotIndex: null, updatedAt: TS },
  { id: 'feeder1', name: 'feeder1', parentAssetId: 'panel1', updatedAt: TS },
  { id: 'branch1', name: 'branch1', parentAssetId: 'feeder1', updatedAt: TS },
];
beforeEach(() => {
  (api.get as any).mockResolvedValue({
    data: { data: { assets, cables: [cable], fiberPaths: [] } },
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

  it('useUnifiedDirty sums overlay dirty(케이블+로그 등) + pendingUploads + floor settings', async () => {
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

    // + 2 staged photos (substationStore photos 컬렉션 — overlay dirty 에 합산)
    act(() => {
      useSubstationWorkingCopy.getState().put('photos', { id: 'u1', equipmentId: 'e1', side: 'front', objectUrl: 'blob:a' });
      useSubstationWorkingCopy.getState().put('photos', { id: 'u2', equipmentId: 'e1', side: 'rear', objectUrl: 'blob:b' });
    });
    rerender();
    expect(result.current).toBe(3);

    // + 1 staged log (substationStore logs 컬렉션 — overlay dirty 에 합산)
    act(() => {
      useSubstationWorkingCopy.getState().put('logs', { id: 'l1', equipmentId: 'e1', logType: 'CHECK', title: 't' });
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
    expect(result.current.map((e: any) => e.id).sort()).toEqual(['o1', 'panel1', 'r1']); // m1 (rack module) + x1 (other floor) excluded; panel1 placed DIST
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

  it('useEffectiveFloorCables(f1) → cableOnFloor(단일 assetId + floorAnchor, 레거시 폴백 제거)', async () => {
    // f1: r1(self), o1(self), m1(→r1), panel1(self), branch1(→feeder1→panel1) ; f2: x1
    const cables = [
      // 단계4a — endpoint = 단일 assetId. assetId 가 floorAnchor 로 f1 에 해소되면 멤버.
      { id: 'c-asset', sourceAssetId: 'r1', targetAssetId: 'o1', source: {}, target: {}, updatedAt: TS }, // both f1
      { id: 'c-mod', sourceAssetId: 'm1', targetAssetId: 'o1', source: {}, target: {}, updatedAt: TS }, // m1→r1 (f1)
      // 시드 분기 케이블: target = branch asset → floorAnchor → feeder1 → panel1(f1) ⇒ 포함.
      { id: 'c-branch', sourceAssetId: 'r1', targetAssetId: 'branch1', source: {}, target: {}, updatedAt: TS },
      { id: 'c-f2', sourceAssetId: 'x1', targetAssetId: null, source: {}, target: {}, updatedAt: TS }, // x1 on f2 only
      // assetId 없는 옛 row 는 이제 비멤버(레거시 nested 폴백 제거됨).
      { id: 'c-legacy', sourceAssetId: null, targetAssetId: null, source: { equipmentId: 'r1', moduleId: null }, target: { equipmentId: null, moduleId: null }, updatedAt: TS },
    ];
    (api.get as any).mockResolvedValue({
      data: { data: { assets, cables, fiberPaths: [] } },
    });
    await act(async () => {
      await useSubstationWorkingCopy.getState().load('s1');
    });
    const { result } = renderHook(() => useEffectiveFloorCables('f1'));
    expect(result.current.map((c: any) => c.id).sort()).toEqual(['c-asset', 'c-branch', 'c-mod']);
    // c-f2 excluded (x1 only on f2); c-legacy excluded (no assetId)
  });
});
