import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SelectionContext, useSelection } from './SelectionContext';

function Probe() {
  const sel = useSelection();
  return <div data-testid="has">{sel ? 'yes' : 'no'}</div>;
}

describe('useSelection', () => {
  it('Provider 밖이면 null', () => {
    render(<Probe />);
    expect(screen.getByTestId('has').textContent).toBe('no');
  });
  it('Provider 안이면 set 호출', () => {
    const setSelectedAssetId = vi.fn();
    function Btn() {
      const sel = useSelection();
      return <button onClick={() => sel?.setSelectedAssetId('a1')}>go</button>;
    }
    render(
      <SelectionContext.Provider value={{ selectedAssetId: null, setSelectedAssetId }}>
        <Btn />
      </SelectionContext.Provider>,
    );
    fireEvent.click(screen.getByText('go'));
    expect(setSelectedAssetId).toHaveBeenCalledWith('a1');
  });
});
