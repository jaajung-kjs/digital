import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useSelection } from './SelectionContext';
import { useSelectionStore } from './selectionStore';

// useSelection 은 Zustand selectionStore 백킹 — Provider 없이도 항상 동작(truthy).
describe('useSelection (store-backed)', () => {
  beforeEach(() => {
    useSelectionStore.setState({ selectedAssetId: null });
  });

  it('Provider 없이도 항상 객체를 반환한다', () => {
    function Probe() {
      const sel = useSelection();
      return <div data-testid="has">{sel ? 'yes' : 'no'}</div>;
    }
    render(<Probe />);
    expect(screen.getByTestId('has').textContent).toBe('yes');
  });

  it('setSelectedAssetId 가 store 에 기록된다', () => {
    function Btn() {
      const sel = useSelection();
      return <button onClick={() => sel.setSelectedAssetId('a1')}>go</button>;
    }
    render(<Btn />);
    fireEvent.click(screen.getByText('go'));
    expect(useSelectionStore.getState().selectedAssetId).toBe('a1');
  });

  it('store 변경이 useSelection 으로 반영된다', () => {
    function Probe() {
      const sel = useSelection();
      return <div data-testid="sel">{sel.selectedAssetId ?? 'null'}</div>;
    }
    render(<Probe />);
    expect(screen.getByTestId('sel').textContent).toBe('null');
    act(() => {
      useSelectionStore.setState({ selectedAssetId: 'x' });
    });
    expect(screen.getByTestId('sel').textContent).toBe('x');
  });
});
