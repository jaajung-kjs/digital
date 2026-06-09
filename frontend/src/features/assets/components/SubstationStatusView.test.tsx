import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusSummary } from './SubstationStatusView';

describe('StatusSummary', () => {
  it('총계 + 종류별 개수 칩', () => {
    render(<StatusSummary total={7} items={[{ key: 'RACK', label: '랙', count: 5 }, { key: 'OFD', label: 'OFD', count: 2 }]} />);
    expect(screen.getByText(/전체 7/)).toBeInTheDocument();
    expect(screen.getByText(/랙 5/)).toBeInTheDocument();
    expect(screen.getByText(/OFD 2/)).toBeInTheDocument();
  });
});
