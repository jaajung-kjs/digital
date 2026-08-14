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
    const { result } = at('/n/sub-1?view=선번장&asset=a1&part=p1&port=po1');
    expect(result.current).toMatchObject({
      nodeId: 'sub-1',
      view: '선번장',
      assetId: 'a1',
      partId: 'p1',
      portId: 'po1',
    });
  });

  it('없거나 모르는 판 이름은 첫 판으로 — 주소는 남이 손으로 고칠 수 있다', () => {
    expect(at('/n/sub-1').result.current.view).toBe('현황');
    expect(at('/n/sub-1?view=없는판').result.current.view).toBe('현황');
  });

  it('자산을 지우면 부품·포트도 함께 지워진다 — 셋은 한 동작의 결과다', () => {
    const { result } = at('/n/sub-1?asset=a1&part=p1&port=po1');
    act(() => result.current.selectAsset(null));
    expect(result.current.assetId).toBeNull();
    expect(result.current.partId).toBeNull();
    expect(result.current.portId).toBeNull();
  });

  it('판을 바꿔도 보던 자산은 그대로다 — 같은 자리를 다르게 보는 일이다', () => {
    const { result } = at('/n/sub-1?asset=a1');
    act(() => result.current.setView('계통'));
    expect(result.current.view).toBe('계통');
    expect(result.current.assetId).toBe('a1');
  });
});
