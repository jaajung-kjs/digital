import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CatalogTable } from './CatalogTable';

type R = { id: string; name: string };
const base = {
  columns: [{ label: '이름', cell: (r: R) => <span>{r.name}</span> }],
  rowKey: (r: R) => r.id,
  rowMatch: (r: R, q: string) => r.name.toLowerCase().includes(q.toLowerCase()),
  onReorderGroups: vi.fn(), onReorderRows: vi.fn(),
  onAddGroup: vi.fn(), addGroupLabel: '+ 분류',
};

describe('CatalogTable', () => {
  it('그룹헤더 + 행 렌더, +종류/+분류 콜백', () => {
    const onAdd = vi.fn();
    render(<CatalogTable {...base} query=""
      groups={[{ id: 'g1', header: <span>통신</span>, rows: [{ id: 'r1', name: 'OFD' }], addLabel: '+ 종류', onAdd }]} />);
    expect(screen.getByText('통신')).toBeInTheDocument();
    expect(screen.getByText('OFD')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ 종류' }));
    expect(onAdd).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: '+ 분류' }));
    expect(base.onAddGroup).toHaveBeenCalledOnce();
  });
  it('검색: 매치 행만, 전체 0 이면 빈상태', () => {
    render(<CatalogTable {...base} query="zzz"
      groups={[{ id: 'g1', header: <span>통신</span>, rows: [{ id: 'r1', name: 'OFD' }], addLabel: '+ 종류', onAdd: vi.fn() }]} />);
    expect(screen.queryByText('OFD')).not.toBeInTheDocument();
    expect(screen.getByText('결과가 없습니다.')).toBeInTheDocument();
  });
  it('onDelete 있으면 그룹 삭제 버튼', () => {
    const onDelete = vi.fn();
    render(<CatalogTable {...base} query=""
      groups={[{ id: 'g1', header: <span>빈분류</span>, rows: [], addLabel: '+ 종류', onAdd: vi.fn(), onDelete }]} />);
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
