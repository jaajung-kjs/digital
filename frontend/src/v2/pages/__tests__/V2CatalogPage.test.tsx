import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const data = {
  categories: [{ id: 'c1', key: 'C', name: '통신', sortOrder: 1 }],
  equipmentTypes: [{ id: 'e1', key: 'E', name: 'OFD', sortOrder: 1, categoryId: 'c1' }, { id: 'e2', key: 'E2', name: 'ODF', sortOrder: 2, categoryId: 'c1' }],
  rackTypes: [{ id: 'r1', key: 'R', name: '19인치', sortOrder: 1 }],
  cableTypes: [{ id: 'k1', key: 'K', name: '광케이블', sortOrder: 1, medium: 'fiber' }],
};
const fetchCatalog = vi.fn();
beforeEach(() => fetchCatalog.mockResolvedValue(data));
vi.mock('../../model/api', () => ({
  fetchCatalog: (...a: unknown[]) => fetchCatalog(...a),
  createCatalogRow: vi.fn(), patchCatalogRow: vi.fn(), deleteCatalogRow: vi.fn(), putOrder: vi.fn(), fetchNodeEquipment: vi.fn(),
}));

import V2CatalogPage from '../V2CatalogPage';
import { asViewer } from '../../../tests/asRole';

function Where() { return <div data-testid="loc">{useLocation().search}</div>; }
const renderAt = (url: string) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[url]}><V2CatalogPage /><Where /></MemoryRouter>
    </QueryClientProvider>,
  );

describe('V2CatalogPage', () => {
  it('왼쪽에 네 항목과 개수가 보이고 키 열은 없다', async () => {
    renderAt('/catalog');
    expect(await screen.findByRole('button', { name: /설비 품목\s*2/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /랙 품목\s*1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /케이블 품목\s*1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /분야\s*1/ })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '키' })).toBeNull();
    expect(screen.getByRole('button', { name: /설비 품목/ })).toHaveAttribute('aria-current', 'true');
  });

  it('케이블 품목을 누르면 kind=cable 과 케이블 표', async () => {
    renderAt('/catalog');
    fireEvent.click(await screen.findByRole('button', { name: /케이블 품목/ }));
    expect(screen.getByTestId('loc')).toHaveTextContent('kind=cable');
    expect(screen.getByRole('columnheader', { name: '매체' })).toBeInTheDocument();
    expect(screen.getByText('광케이블')).toBeInTheDocument();
  });

  it('주소의 kind 로 바로 선다', async () => {
    renderAt('/catalog?kind=rack');
    expect(await screen.findByText('19인치')).toBeInTheDocument();
  });
});

describe('V2CatalogPage — 조회 사용자', () => {
  asViewer();
  it('추가·삭제가 없고 칸은 누를 수 없다(읽는 줄만)', async () => {
    renderAt('/catalog?kind=equipment');
    expect(await screen.findByText('OFD')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '추가' })).toBeNull();
    expect(screen.queryAllByRole('button', { name: /삭제$|수정$/ })).toEqual([]);
    expect(screen.queryByText('수정하면 즉시 반영됩니다')).toBeNull();
  });
});
