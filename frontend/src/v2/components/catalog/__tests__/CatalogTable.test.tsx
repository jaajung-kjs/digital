import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn();
const patch = vi.fn();
const remove = vi.fn();
/* vitest.config 의 mockReset 이 매 시험 전에 구현을 비우므로 여기서 다시 채운다. */
beforeEach(() => {
  create.mockResolvedValue({});
  patch.mockResolvedValue({});
  remove.mockRejectedValue(Object.assign(new Error('x'), { isAxiosError: true, response: { status: 409, data: { error: 'TYPE_IN_USE', message: '3건이 이 종류를 쓰고 있어 지울 수 없습니다' } } }));
});
vi.mock('../../../model/api', () => ({ createCatalogRow: (...a: unknown[]) => create(...a), patchCatalogRow: (...a: unknown[]) => patch(...a), deleteCatalogRow: (...a: unknown[]) => remove(...a), fetchCatalog: vi.fn(), fetchNodeEquipment: vi.fn(), putOrder: vi.fn() }));

import { CatalogTable } from '../CatalogTable';

const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
const columns = [{ key: 'sortOrder', label: '순서', kind: 'number' as const }, { key: 'name', label: '이름', kind: 'text' as const, required: true }];

describe('CatalogTable', () => {
  it('이름을 고치면 그 행만 patch 한다', async () => {
    wrap(<CatalogTable kind="rack-types" title="랙 품목" rows={[{ id: 'r1', key: 'R', name: '19인치', sortOrder: 1 }]} columns={columns} newRow={() => ({})} />);
    fireEvent.click(screen.getByText('19인치'));
    const input = screen.getByDisplayValue('19인치');
    fireEvent.change(input, { target: { value: '19인치 통신랙' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(patch).toHaveBeenCalledWith('rack-types', 'r1', { name: '19인치 통신랙' }));
  });

  it('쓰이는 품목을 지우면 서버 문구를 보인다', async () => {
    wrap(<CatalogTable kind="rack-types" title="랙 품목" rows={[{ id: 'r1', key: 'R', name: '19인치', sortOrder: 1 }]} columns={columns} newRow={() => ({})} />);
    fireEvent.click(screen.getByRole('button', { name: '19인치 지우기' }));
    expect(await screen.findByText(/3건이 이 종류를 쓰고 있어/)).toBeInTheDocument();
  });

  it('추가 행에 키와 이름을 적고 Enter 하면 create 한다', async () => {
    wrap(<CatalogTable kind="rack-types" title="랙 품목" rows={[]} columns={columns} newRow={() => ({ sortOrder: 5 })} />);
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    fireEvent.change(screen.getByLabelText('키'), { target: { value: 'K' } });
    const name = screen.getByLabelText('이름');
    fireEvent.change(name, { target: { value: '새 랙' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    await waitFor(() => expect(create).toHaveBeenCalledWith('rack-types', { sortOrder: 5, key: 'K', name: '새 랙' }));
  });
});
