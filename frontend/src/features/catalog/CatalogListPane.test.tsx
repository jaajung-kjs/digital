import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CatalogListPane } from './CatalogListPane';

const groups = [{ id: 'g1', name: '통신' }, { id: 'g2', name: '전원' }];
const items = [
  { id: 't1', parentId: 'g1', name: 'OFD', system: true },
  { id: 't2', parentId: 'g1', name: '통합단말' },
  { id: 't3', parentId: 'g2', name: 'UPS' },
];
const base = { groups, items, selectedId: null, onSelect: vi.fn(), onAddGroup: vi.fn(), onAddItem: vi.fn(), addGroupLabel: '+ 분류', addItemLabel: '+ 종류', onReorder: vi.fn() };

it('그룹·리프 렌더 + 시스템 배지', () => {
  render(<CatalogListPane {...base} />);
  expect(screen.getByText('통신')).toBeInTheDocument();
  expect(screen.getByText('통합단말')).toBeInTheDocument();
  expect(screen.getAllByText('시스템').length).toBe(1);
});
it('리프 클릭 → onSelect(item, id)', () => {
  const onSelect = vi.fn();
  render(<CatalogListPane {...base} onSelect={onSelect} />);
  fireEvent.click(screen.getByText('통합단말'));
  expect(onSelect).toHaveBeenCalledWith('item', 't2');
});
it('검색 → 이름 필터', () => {
  render(<CatalogListPane {...base} />);
  fireEvent.change(screen.getByRole('textbox', { name: '검색' }), { target: { value: 'UPS' } });
  expect(screen.queryByText('통합단말')).toBeNull();
  expect(screen.getByText('UPS')).toBeInTheDocument();
});
