import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatusSummary } from './StatusSummary';

describe('StatusSummary', () => {
  it('총계 + 종류별 개수 칩', () => {
    render(<StatusSummary total={7} items={[{ key: 'RACK', label: '랙', count: 5 }, { key: 'OFD', label: 'OFD', count: 2 }]} />);
    expect(screen.getByText(/전체 7/)).toBeInTheDocument();
    expect(screen.getByText(/랙 5/)).toBeInTheDocument();
    expect(screen.getByText(/OFD 2/)).toBeInTheDocument();
  });

  it('칩 클릭 시 onSelect(key) — 필터 토글', () => {
    const onSelect = vi.fn();
    render(
      <StatusSummary
        total={7}
        items={[{ key: 'RACK', label: '랙', count: 5 }]}
        active=""
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByText(/랙 5/));
    expect(onSelect).toHaveBeenCalledWith('RACK');
    fireEvent.click(screen.getByText(/전체 7/));
    expect(onSelect).toHaveBeenCalledWith('');
  });
});
