import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkspaceNavContext, useWorkspaceNav } from './WorkspaceNavContext';

function Probe() {
  const ws = useWorkspaceNav();
  return <div data-testid="has">{ws ? 'yes' : 'no'}</div>;
}

describe('useWorkspaceNav', () => {
  it('Provider 밖이면 null', () => {
    render(<Probe />);
    expect(screen.getByTestId('has').textContent).toBe('no');
  });
  it('Provider 안이면 컨텍스트 반환 + 버튼이 gotoFloor 호출', () => {
    const gotoFloor = vi.fn();
    const nav = { gotoFloor, gotoRegister: vi.fn() };
    function Btn() {
      const ws = useWorkspaceNav();
      return <button onClick={() => ws?.gotoFloor('f1', 'a1')}>go</button>;
    }
    render(<WorkspaceNavContext.Provider value={nav}><Btn /></WorkspaceNavContext.Provider>);
    fireEvent.click(screen.getByText('go'));
    expect(gotoFloor).toHaveBeenCalledWith('f1', 'a1');
  });
});
