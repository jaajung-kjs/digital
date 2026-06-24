import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CableTypePicker } from './CableTypePicker';

vi.mock('../hooks/useCableGroups', () => ({
  useCableGroups: () => ({ data: [
    { id: 'g1', name: '전원', color: '#ef4444' },
    { id: 'g2', name: '광', color: '#22c55e' },
  ] }),
}));
vi.mock('../hooks/useCableCategories', () => ({
  useCableCategories: () => ({ data: [
    { id: 'c1', name: 'F-CV', groupId: 'g1' },
    { id: 'c2', name: 'OPGW', groupId: 'g2' },
  ] }),
}));

describe('CableTypePicker', () => {
  it('그룹 선택 → 그 그룹 이름만, 이름 선택 → onChange(categoryId)', () => {
    const onChange = vi.fn();
    render(<CableTypePicker value={null} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('그룹'), { target: { value: 'g2' } });
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: 'c2' } });
    expect(onChange).toHaveBeenCalledWith('c2');
  });

  it('value(categoryId) 로 현재 그룹/이름 표시', () => {
    render(<CableTypePicker value="c1" onChange={vi.fn()} />);
    expect((screen.getByLabelText('그룹') as HTMLSelectElement).value).toBe('g1');
    expect((screen.getByLabelText('이름') as HTMLSelectElement).value).toBe('c1');
  });
});
