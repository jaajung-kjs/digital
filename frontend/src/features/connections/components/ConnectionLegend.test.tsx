import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConnectionLegend } from './ConnectionLegend';

const setConnectionFilters = vi.fn();
vi.mock('../../editor/stores/editorStore', () => ({
  useEditorStore: (sel: (s: unknown) => unknown) =>
    sel({ connectionFilters: ['catP', 'catO'], setConnectionFilters }),
}));
vi.mock('../../cables/hooks/useCableGroups', () => ({
  useCableGroups: () => ({ data: [
    { id: 'gP', name: '전원', color: '#ef4444', sortOrder: 0, isActive: true },
    { id: 'gO', name: '광', color: '#22c55e', sortOrder: 1, isActive: true },
  ] }),
}));
vi.mock('../../cables/hooks/useCableCategories', () => ({
  useCableCategories: () => ({ data: [
    { id: 'catP', name: 'FR', groupId: 'gP', isActive: true },
    { id: 'catO', name: 'OPGW', groupId: 'gO', isActive: true },
  ] }),
}));

beforeEach(() => setConnectionFilters.mockClear());

describe('ConnectionLegend', () => {
  it('사용자 그룹별 토글을 렌더한다', () => {
    render(<ConnectionLegend />);
    expect(screen.getByText('전원')).toBeInTheDocument();
    expect(screen.getByText('광')).toBeInTheDocument();
  });
  it('그룹 토글이 categoryId 로 필터를 끈다', () => {
    render(<ConnectionLegend />);
    fireEvent.click(screen.getByText('전원'));
    expect(setConnectionFilters).toHaveBeenCalledWith(['catO']); // catP 제거
  });
});
