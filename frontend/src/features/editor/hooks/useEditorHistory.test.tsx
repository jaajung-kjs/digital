import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
vi.mock('../../../utils/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
import { api } from '../../../utils/api';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { useEditorHistory } from './useEditorHistory';

const ofd = {
  id: 'o1', name: 'OFD', substationId: 's1', floorId: 'f1',
  assetType: { placementKind: 'OFD' }, positionX: 5, positionY: 5,
  parentAssetId: null, slotIndex: null, updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  (api.get as any).mockResolvedValue({
    data: { data: { assets: [ofd], cables: [], fiberPaths: [] } },
  });
});

describe('useEditorHistory', () => {
  it('canUndo flips true after staging, undo reverts + notifies store subscribers (canvas redraw)', async () => {
    await useSubstationWorkingCopy.getState().load('s1');

    const { result } = renderHook(() => useEditorHistory());
    // initial: empty history
    expect(result.current.canUndo).toBe(false);

    // canvas subscribes to the main store; count notifications to prove redraw scheduling fires.
    let notified = 0;
    const unsub = useSubstationWorkingCopy.subscribe(() => { notified += 1; });

    // stage a change → hook must observe canUndo===true (proves useStore(temporal) subscription works)
    act(() => {
      useSubstationWorkingCopy.getState().stageEquipmentUpdate('o1', { positionX: 99 });
    });
    expect(result.current.canUndo).toBe(true);
    expect(useSubstationWorkingCopy.getState().effectiveAssets().find((a) => a.id === 'o1')!.positionX).toBe(99);

    const afterStage = notified;
    expect(afterStage).toBeGreaterThan(0); // staging notified subscribers

    // undo via the hook → reverts overlay AND notifies subscribers (canvas redraw trigger)
    act(() => {
      result.current.undo();
    });
    expect(useSubstationWorkingCopy.getState().effectiveAssets().find((a) => a.id === 'o1')!.positionX).toBe(5);
    expect(result.current.canUndo).toBe(false);
    expect(notified).toBeGreaterThan(afterStage); // undo fired the store subscription → canvas redraws

    unsub();
  });
});
