import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGridSort } from './useGridSort';

describe('useGridSort cycleSort', () => {
  it('asc→desc→해제, 다른 col→asc', () => {
    const { result } = renderHook(() => useGridSort());
    expect(result.current.sort).toBeNull();
    act(() => result.current.cycleSort('이름'));
    expect(result.current.sort).toEqual({ col: '이름', dir: 'asc' });
    act(() => result.current.cycleSort('이름'));
    expect(result.current.sort).toEqual({ col: '이름', dir: 'desc' });
    act(() => result.current.cycleSort('이름'));
    expect(result.current.sort).toBeNull();
    act(() => result.current.cycleSort('이름'));
    act(() => result.current.cycleSort('종류'));
    expect(result.current.sort).toEqual({ col: '종류', dir: 'asc' });
  });
});
