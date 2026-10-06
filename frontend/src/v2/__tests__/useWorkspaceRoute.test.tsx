import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useWorkspaceRoute } from '../useWorkspaceRoute';

const at = (path: string) =>
  renderHook(() => useWorkspaceRoute(), {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={children} />
          <Route path="/n/:nodeId" element={children} />
        </Routes>
      </MemoryRouter>
    ),
  });

describe('useWorkspaceRoute', () => {
  it('주소가 보고 있는 자리를 그대로 말한다', () => {
    const { result } = at('/n/sub-1?view=평면도&eq=e1&rack=r1');
    expect(result.current).toMatchObject({ nodeId: 'sub-1', view: '평면도', eqId: 'e1', rackId: 'r1' });
  });

  it('없거나 모르는 판 이름은 첫 판으로 — 주소는 남이 손으로 고칠 수 있다', () => {
    expect(at('/n/sub-1').result.current.view).toBe('현황');
    expect(at('/n/sub-1?view=없는판').result.current.view).toBe('현황');
    expect(at('/n/sub-1?view=선번장').result.current.view).toBe('현황');
    expect(at('/n/sub-1?view=설비 대장').result.current.view).toBe('현황');
    expect(at('/n/sub-1?view=설비 현황').result.current.view).toBe('현황');
  });

  it('설비·랙을 고르고 놓는다', () => {
    const { result } = at('/n/sub-1?eq=e1&rack=r1');
    act(() => result.current.selectEquipment(null));
    expect(result.current.eqId).toBeNull();
    expect(result.current.rackId).toBe('r1');
    act(() => result.current.selectRack('r2'));
    expect(result.current.rackId).toBe('r2');
  });

  it('판을 바꿔도 고른 설비는 그대로다 — 같은 자리를 다르게 보는 일이다', () => {
    const { result } = at('/n/sub-1?eq=e1');
    act(() => result.current.setView('평면도'));
    expect(result.current.view).toBe('평면도');
    expect(result.current.eqId).toBe('e1');
  });
});
