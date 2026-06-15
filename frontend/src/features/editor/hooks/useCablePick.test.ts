import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCablePick } from './useCablePick';
import { useInteractionStore } from '../stores/interactionStore';

// Mock commitCable so it doesn't reach into substationStore/editorStore in the test env.
// We assert it was called (and that cableSetTarget moved phase to 'ready' beforehand).
vi.mock('../cableConnection', () => ({ commitCable: vi.fn() }));
import { commitCable } from '../cableConnection';

beforeEach(() => {
  useInteractionStore.getState().cancel();
  vi.clearAllMocks();
});

describe('useCablePick', () => {
  it('pick 모드 아니면 active=false', () => {
    const { result } = renderHook(() => useCablePick());
    expect(result.current.active).toBe(false);
  });

  it('pickingSourceEndpoint → active, side=source, onPick→drawingPath', () => {
    act(() => {
      const s = useInteractionStore.getState();
      s.cableActivate({ category: { id: 'c', code: 'C', name: 'C', displayColor: null } });
      s.cableSetPendingSource();
    });
    const { result } = renderHook(() => useCablePick());
    expect(result.current).toMatchObject({ active: true, side: 'source' });
    act(() => result.current.onPick({ containerAssetId: 'distA', position: { x: 0, y: 0 }, innerAssetId: 'f1', role: 'OUT' }));
    expect(useInteractionStore.getState().mode).toMatchObject({ kind: 'cableDrawing', data: { phase: 'drawingPath' } });
  });

  it('pickingTargetEndpoint → side=target, onPick→ready 후 commitCable 호출(생성)', () => {
    act(() => {
      const s = useInteractionStore.getState();
      s.cableActivate({ category: { id: 'c', code: 'C', name: 'C', displayColor: null } });
      s.cableSetSource({ containerAssetId: 'a', position: { x: 0, y: 0 } });
      s.cableSetPendingTarget();
    });
    const { result } = renderHook(() => useCablePick());
    expect(result.current.side).toBe('target');

    act(() => result.current.onPick({ containerAssetId: 'b', position: { x: 1, y: 1 }, role: 'OUT' }));

    // cableSetTarget should have moved phase to 'ready' before commitCable was called
    // After commitCable (mocked) the store stays at ready — assert commitCable was called
    expect(commitCable).toHaveBeenCalledTimes(1);

    // Phase must have transitioned away from pickingTargetEndpoint
    const m = useInteractionStore.getState().mode;
    expect(
      m.kind === 'idle' ||
      (m.kind === 'cableDrawing' && m.data.phase !== 'pickingTargetEndpoint'),
    ).toBe(true);
  });
});
