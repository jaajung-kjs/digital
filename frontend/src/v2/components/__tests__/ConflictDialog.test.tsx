import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConflictDialog, conflictLabel } from '../ConflictDialog';
import { workingCopyStore } from '../../model/store/workingCopy';

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const empty = { creates: {}, updates: {}, deletes: [] };
const s = {
  saved: {
    racks: [{ id: U(1), name: '통신랙' }],
    equipment: [{ id: U(2), name: 'L3 #1' }],
    floors: [{ id: U(3), name: '1층' }],
    fiberLines: [{ id: U(4), name: '북춘천-춘천' }],
    links: [{ id: U(5) }],
    refEquipment: [],
  },
  overlays: { racks: empty, equipment: empty, floors: empty, fiberLines: empty, links: empty },
} as never;

describe('conflictLabel', () => {
  it('차단기·코어 자연 키', () => {
    expect(conflictLabel(s, `circuit:${U(2)}:3`)).toBe('L3 #1 차단기 3');
    expect(conflictLabel(s, `core:${U(4)}:7`)).toBe('북춘천-춘천 코어 7');
  });
  it('uuid 는 랙·설비·층·광선로·연결로 푼다', () => {
    expect(conflictLabel(s, U(1))).toBe('통신랙');
    expect(conflictLabel(s, U(2))).toBe('L3 #1');
    expect(conflictLabel(s, U(3))).toBe('1층');
    expect(conflictLabel(s, U(4))).toBe('북춘천-춘천');
    expect(conflictLabel(s, U(5))).toBe('연결');
  });
  it('모르는 키는 앞 8자', () => {
    expect(conflictLabel(s, 'zzzzzzzzzzzz')).toBe('zzzzzzzz');
  });
});

describe('ConflictDialog', () => {
  afterEach(() => vi.restoreAllMocks());

  it('「충돌 항목만 버리고 계속」은 rebase 하고, 무엇을 버렸고 몇 건이 남았는지 상자 안에 적는다', async () => {
    const rebase = vi.spyOn(workingCopyStore.getState(), 'rebase').mockResolvedValue([{ key: 'x'.repeat(12), kind: 'racks', reason: 'conflict' }]);
    vi.spyOn(workingCopyStore.getState(), 'dirtyCount').mockReturnValue(3);
    const onClose = vi.fn();
    render(<ConflictDialog conflicts={[{ key: 'x'.repeat(12), reason: 'modified' }]} onClose={onClose} />);
    expect(screen.getByText(/아래 1건이 서버와 충돌하여/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '충돌 항목만 버리고 계속' }));
    expect(await screen.findByText('충돌한 항목 1건의 변경을 취소했습니다.')).toBeInTheDocument();
    expect(rebase).toHaveBeenCalledWith([{ key: 'x'.repeat(12), reason: 'modified' }]);
    expect(screen.getByRole('list', { name: '취소한 변경' })).toHaveTextContent('xxxxxxxx');
    expect(screen.getByText(/나머지 변경 3건은 그대로입니다/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('「변경 유지하고 닫기」는 아무것도 바꾸지 않고 닫는다', () => {
    const rebase = vi.spyOn(workingCopyStore.getState(), 'rebase');
    const refresh = vi.spyOn(workingCopyStore.getState(), 'refresh');
    const onClose = vi.fn();
    render(<ConflictDialog conflicts={[{ key: 'x'.repeat(12), reason: 'deleted' }]} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: '변경 유지하고 닫기' }));
    expect(onClose).toHaveBeenCalled();
    expect(rebase).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('다시 읽기가 실패하면 닫지 않고 상자 안에 까닭을 적고, 다시 시도할 수 있다', async () => {
    let fail = true;
    vi.spyOn(workingCopyStore.getState(), 'rebase').mockImplementation(async () => { if (fail) throw new Error('끊김'); return []; });
    const onClose = vi.fn();
    render(<ConflictDialog conflicts={[{ key: 'x'.repeat(12), reason: 'deleted' }]} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: '충돌 항목만 버리고 계속' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('서버에서 새로 불러오지 못했습니다');
    expect(onClose).not.toHaveBeenCalled();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('충돌한 항목 0건의 변경을 취소했습니다.')).toBeInTheDocument();
  });
});
