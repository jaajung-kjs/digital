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
    fireEvent.click(await screen.findByRole('button', { name: '지우기' }));
    expect(await screen.findByText(/3건이 이 종류를 쓰고 있어/)).toBeInTheDocument();
  });

  it('추가 행에 이름을 적고 Enter 하면 접두 맞는 키가 자동으로 실려 create 한다', async () => {
    wrap(<CatalogTable kind="rack-types" title="랙 품목" rows={[]} columns={columns} newRow={() => ({ sortOrder: 5 })} />);
    expect(screen.queryByText('키')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    const name = screen.getByLabelText('이름');
    fireEvent.change(name, { target: { value: '새 랙' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const body = create.mock.calls[0][1] as Record<string, unknown>;
    expect(body).toMatchObject({ sortOrder: 5, name: '새 랙' });
    expect(body.key).toMatch(/^RACK-[0-9a-z]+-[0-9a-z]{4}$/);
  });

  it('KEY_TAKEN 이면 다른 키로 한 번 다시 시도한다', async () => {
    create.mockRejectedValueOnce(Object.assign(new Error('x'), { isAxiosError: true, response: { status: 409, data: { error: 'KEY_TAKEN', message: '같은 키가 이미 있습니다' } } }));
    wrap(<CatalogTable kind="rack-types" title="랙 품목" rows={[]} columns={columns} newRow={() => ({})} />);
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    const name = screen.getByLabelText('이름');
    fireEvent.change(name, { target: { value: '새 랙' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect((create.mock.calls[1][1] as { key: string }).key).not.toBe((create.mock.calls[0][1] as { key: string }).key);
    await waitFor(() => expect(screen.queryByLabelText('이름')).toBeNull());
  });

  it('자재단가는 천 단위로 보이고 고칠 때는 원래 수다', () => {
    const cols = [...columns, { key: 'unitPrice', label: '자재단가', kind: 'number' as const }];
    wrap(<CatalogTable kind="rack-types" title="랙 품목" rows={[{ id: 'r1', name: '19인치', sortOrder: 1, unitPrice: 3000000 }]} columns={cols} newRow={() => ({})} />);
    fireEvent.click(screen.getByText('3,000,000'));
    expect(screen.getByDisplayValue('3000000')).toBeInTheDocument();
  });

  it('고르기 칸은 평소 글자이고 누르면 고르기가 열린다', () => {
    const cols = [...columns, { key: 'categoryId', label: '분야', kind: 'select' as const, options: [{ value: 'c1', label: '통신' }] }];
    wrap(<CatalogTable kind="equipment-types" title="설비 품목" rows={[{ id: 'e1', name: 'OFD', sortOrder: 1, categoryId: 'c1' }]} columns={cols} newRow={() => ({})} />);
    expect(screen.queryByRole('combobox')).toBeNull();
    fireEvent.click(screen.getByText('통신'));
    expect(screen.getByRole('combobox', { name: 'OFD 분야' })).toBeInTheDocument();
  });

  const open = () => fireEvent.click(screen.getByRole('button', { name: '추가' }));
  const fill = () => {
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '새 랙' } });
  };
  const draftRack = () => wrap(<CatalogTable kind="rack-types" title="랙 품목" rows={[]} columns={columns} newRow={() => ({})} />);

  it('Enter 없이 포커스만 나가면 만들지 않는다', async () => {
    draftRack(); open(); fill();
    fireEvent.blur(screen.getByLabelText('이름'), { relatedTarget: document.body });
    await new Promise((r) => setTimeout(r, 20));
    expect(create).not.toHaveBeenCalled();
  });

  it('Enter 를 두 번 눌러도 한 번만 만든다', async () => {
    let done!: () => void;
    create.mockImplementation(() => new Promise((r) => { done = () => r({}); }));
    draftRack(); open(); fill();
    const name = screen.getByLabelText('이름');
    fireEvent.keyDown(name, { key: 'Enter' });
    fireEvent.keyDown(name, { key: 'Enter' });
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(create).toHaveBeenCalledTimes(1);
    done();
  });

  it('만들기가 실패하면 초안을 두고 문구를 보인다', async () => {
    create.mockRejectedValue(Object.assign(new Error('x'), { isAxiosError: true, response: { status: 409, data: { message: '이미 있는 키입니다' } } }));
    draftRack(); open(); fill();
    fireEvent.keyDown(screen.getByLabelText('이름'), { key: 'Enter' });
    expect(await screen.findByText('이미 있는 키입니다')).toBeInTheDocument();
    expect(screen.getByLabelText('이름')).toHaveValue('새 랙');
  });

  it('필수 칸이 비면 어느 칸인지 알린다', () => {
    draftRack(); open();
    fireEvent.keyDown(screen.getByLabelText('이름'), { key: 'Enter' });
    expect(screen.getByText('이름 칸을 채우세요')).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it('지우기는 먼저 묻고, 취소하면 부르지 않는다', async () => {
    wrap(<CatalogTable kind="rack-types" title="랙 품목" rows={[{ id: 'r1', key: 'R', name: '19인치', sortOrder: 1 }]} columns={columns} newRow={() => ({})} />);
    fireEvent.click(screen.getByRole('button', { name: '19인치 지우기' }));
    fireEvent.click(await screen.findByRole('button', { name: '취소' }));
    await new Promise((r) => setTimeout(r, 20));
    expect(remove).not.toHaveBeenCalled();
  });

  it('순서 칸을 비우면 보내지 않는다', async () => {
    wrap(<CatalogTable kind="rack-types" title="랙 품목" rows={[{ id: 'r1', key: 'R', name: '19인치', sortOrder: 1 }]} columns={columns} newRow={() => ({})} />);
    fireEvent.click(screen.getByText('1'));
    const input = screen.getByDisplayValue('1');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await new Promise((r) => setTimeout(r, 20));
    expect(patch).not.toHaveBeenCalled();
  });
});
