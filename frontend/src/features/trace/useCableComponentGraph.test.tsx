import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const { useServerTraceMock } = vi.hoisted(() => ({ useServerTraceMock: vi.fn() }));

vi.mock('./useServerTrace', () => ({ useServerTrace: useServerTraceMock }));

import { useCableComponentGraph } from './useCableComponentGraph';

beforeEach(() => {
  useServerTraceMock.mockReset();
  useServerTraceMock.mockReturnValue({ graph: { __tag: 'G' }, isLoading: false, error: null });
});

describe('useCableComponentGraph', () => {
  it('cableId → useServerTrace(cableId) 직접 위임', () => {
    const { result } = renderHook(() => useCableComponentGraph('c1'));
    expect(useServerTraceMock).toHaveBeenCalledWith('c1');
    expect(result.current.graph).toEqual({ __tag: 'G' });
  });
  it('cableId null → useServerTrace(null) 비활성', () => {
    renderHook(() => useCableComponentGraph(null));
    expect(useServerTraceMock).toHaveBeenCalledWith(null);
  });
});
