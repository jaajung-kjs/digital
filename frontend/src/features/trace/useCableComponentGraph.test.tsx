import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const { useServerTraceMock } = vi.hoisted(() => ({ useServerTraceMock: vi.fn() }));

vi.mock('./useServerTrace', () => ({ useServerTrace: useServerTraceMock }));
vi.mock('../cables/hooks/useCableCategories', () => ({
  useCableCategories: () => ({ data: [{ id: 'cat1', groupId: 'g1' }] }),
}));
vi.mock('../workingCopy/hooks', () => ({
  useEffectiveCables: () => [{ id: 'c1', sourceAssetId: 'a1', targetAssetId: 'a2', categoryId: 'cat1' }],
}));

import { useCableComponentGraph } from './useCableComponentGraph';

beforeEach(() => {
  useServerTraceMock.mockReset();
  useServerTraceMock.mockReturnValue({ graph: { __tag: 'G' }, isLoading: false, error: null });
});

describe('useCableComponentGraph', () => {
  it('cableId → resolveCableSeed → useServerTrace(seed, group)', () => {
    const { result } = renderHook(() => useCableComponentGraph('c1'));
    expect(useServerTraceMock).toHaveBeenCalledWith('a1', 'g1');
    expect(result.current.graph).toEqual({ __tag: 'G' });
  });
  it('cableId null → useServerTrace(null, null) 비활성', () => {
    renderHook(() => useCableComponentGraph(null));
    expect(useServerTraceMock).toHaveBeenCalledWith(null, null);
  });
  it('group 미해소 케이블 → useServerTrace(null, null)', () => {
    renderHook(() => useCableComponentGraph('nope'));
    expect(useServerTraceMock).toHaveBeenCalledWith(null, null);
  });
});
