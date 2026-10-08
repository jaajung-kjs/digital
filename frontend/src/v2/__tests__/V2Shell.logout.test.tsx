import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { V2Shell } from '../V2Shell';
import { useV2AuthStore } from '../store/authStore';
import { useUnsaved } from '../store/unsavedStore';
import { workingCopyStore } from '../model/store/workingCopy';

const logout = vi.fn(async () => {});

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<V2Shell />}><Route path="/" element={<div>현황</div>} /></Route>
        <Route path="/login" element={<div>로그인 화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** 워킹 카피에 변경 1건 + 화면이 손을 든 상태(현황 화면의 `useUnsavedMark` 와 같다). */
function dirtyOne() {
  workingCopyStore.getState().create('racks', { id: 'r1', substationId: 'S1', name: 'R', rackTypeId: 't' } as never);
  useUnsaved.getState().mark(1, () => workingCopyStore.getState().revert());
}

beforeEach(() => {
  logout.mockClear();
  useV2AuthStore.setState({ user: { username: 'kim', role: 'admin' } as never, logout });
});
afterEach(() => {
  workingCopyStore.getState().reset();
  useUnsaved.getState().mark(0, () => {});
});

describe('로그아웃', () => {
  it('저장 안 한 변경이 있으면 묻고, 머무르면 로그아웃하지 않는다', async () => {
    dirtyOne();
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: /로그아웃/ }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '계속 편집' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(logout).not.toHaveBeenCalled();
    expect(workingCopyStore.getState().dirtyCount()).toBe(1);
  });

  it('나가기로 하면 워킹 카피를 통째로 비우고 로그아웃한다', async () => {
    dirtyOne();
    workingCopyStore.setState({ loaded: ['S1'] });
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: /로그아웃/ }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '변경 취소 후 이동' }));
    await waitFor(() => expect(logout).toHaveBeenCalled());
    expect(workingCopyStore.getState().dirtyCount()).toBe(0);
    expect(workingCopyStore.getState().loaded).toEqual([]);
    expect(await screen.findByText('로그인 화면')).toBeInTheDocument();
  });

  it('변경이 없으면 묻지 않고 비운 뒤 나간다', async () => {
    workingCopyStore.setState({ loaded: ['S1'] });
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: /로그아웃/ }));
    await waitFor(() => expect(logout).toHaveBeenCalled());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(workingCopyStore.getState().loaded).toEqual([]);
  });
});
