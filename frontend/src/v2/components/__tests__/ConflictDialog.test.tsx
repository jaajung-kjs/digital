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
  it('회로·코어 자연 키', () => {
    expect(conflictLabel(s, `circuit:${U(2)}:3`)).toBe('L3 #1 회로 3');
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
  it('새로고침은 refresh() 뒤에 onClose', async () => {
    const order: string[] = [];
    vi.spyOn(workingCopyStore.getState(), 'refresh').mockImplementation(async () => { order.push('refresh'); });
    const onClose = vi.fn(() => order.push('close'));
    render(<ConflictDialog conflicts={[{ key: 'x'.repeat(12), reason: 'deleted' }]} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: '서버 기준으로 새로고침' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(order).toEqual(['refresh', 'close']);
  });

  it('새로고침이 실패하면 닫지 않고 상자 안에 까닭을 적고, 다시 시도할 수 있다', async () => {
    let fail = true;
    vi.spyOn(workingCopyStore.getState(), 'refresh').mockImplementation(async () => { if (fail) throw new Error('끊김'); });
    const onClose = vi.fn();
    render(<ConflictDialog conflicts={[{ key: 'x'.repeat(12), reason: 'deleted' }]} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: '서버 기준으로 새로고침' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('서버에서 새로 불러오지 못했습니다');
    expect(onClose).not.toHaveBeenCalled();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
