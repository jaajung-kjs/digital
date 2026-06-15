import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SortableHeaderCell } from './SortableHeaderCell';

describe('SortableHeaderCell', () => {
  it('sortable: 버튼 클릭 콜백 + aria-sort', () => {
    const onClick = vi.fn();
    render(<table><thead><tr><SortableHeaderCell label="이름" sortable active dir="asc" onClick={onClick} /></tr></thead></table>);
    const btn = screen.getByRole('button', { name: /이름 정렬/ });
    fireEvent.click(btn); expect(onClick).toHaveBeenCalled();
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'ascending');
  });
  it('정적(sortable=false): 버튼 없음', () => {
    render(<table><thead><tr><SortableHeaderCell label="상대국측" /></tr></thead></table>);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
