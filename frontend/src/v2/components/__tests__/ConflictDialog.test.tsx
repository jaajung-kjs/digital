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
    const rebase = vi.spyOn(workingCopyStore.getState(), 'rebase').mockResolvedValue({ dropped: [{ key: 'x'.repeat(12), kind: 'racks', reason: 'conflict', op: 'update' }], blocked: null, gone: [] });
    vi.spyOn(workingCopyStore.getState(), 'dirtyCount').mockReturnValue(3);
    const onClose = vi.fn();
    render(<ConflictDialog conflicts={[{ key: 'x'.repeat(12), reason: 'modified' }]} onClose={onClose} />);
    expect(screen.getByText(/아래 1건이 서버와 충돌하여/)).toHaveTextContent('실행 취소 기록이 초기화됩니다');
    fireEvent.click(screen.getByRole('button', { name: '충돌 항목만 버리고 계속' }));
    expect(await screen.findByText('충돌한 항목과 그에 묶인 변경 1건을 취소했습니다.')).toBeInTheDocument();
    expect(rebase).toHaveBeenCalledWith([{ key: 'x'.repeat(12), reason: 'modified' }], undefined);
    expect(screen.getByRole('list', { name: '취소한 변경' })).toHaveTextContent('xxxxxxxx');
    expect(screen.getByText(/나머지 변경 3건은 그대로입니다/)).toHaveTextContent('실행 취소 기록은 초기화되었습니다.');
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
    vi.spyOn(workingCopyStore.getState(), 'rebase').mockImplementation(async () => { if (fail) throw new Error('끊김'); return { dropped: [], blocked: null, gone: [] }; });
    const onClose = vi.fn();
    render(<ConflictDialog conflicts={[{ key: 'x'.repeat(12), reason: 'deleted' }]} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: '충돌 항목만 버리고 계속' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('서버에서 새로 불러오지 못했습니다');
    expect(onClose).not.toHaveBeenCalled();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('충돌한 항목과 그에 묶인 변경 0건을 취소했습니다.')).toBeInTheDocument();
  });

  it('버리면 맞지 않을 때는 아무것도 버리지 않았다고, 어느 변전소가 막는지 적는다', async () => {
    vi.spyOn(workingCopyStore.getState(), 'rebase').mockResolvedValue({ dropped: [], blocked: { stations: ['북춘천'], message: '같은 변전소에 랙 이름 「A」이 2개 있습니다' }, gone: [] });
    render(<ConflictDialog conflicts={[{ key: 'x'.repeat(12), reason: 'modified' }]} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '충돌 항목만 버리고 계속' }));
    expect(await screen.findByText(/북춘천의 변경이 서로 맞지 않게 됩니다 — 아무것도 버리지 않았습니다/)).toBeInTheDocument();
    expect(screen.getByText('같은 변전소에 랙 이름 「A」이 2개 있습니다')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: '취소한 변경' })).toBeNull();
  });

  it('묶음으로 버린 것과 사라진 행에 기대던 것도 이름을 붙여 적는다', async () => {
    const st = workingCopyStore.getState();
    vi.spyOn(st, 'rebase').mockResolvedValue({
      dropped: [
        { key: U(2), kind: 'equipment', reason: 'conflict', op: 'delete' },
        { key: U(5), kind: 'links', reason: 'cascade', op: 'delete' },
        { key: U(4), kind: 'fiberLines', reason: 'cascade', op: 'endClear' },
      ],
      blocked: null, gone: ['춘천HP'],
    });
    workingCopyStore.setState({ saved: { ...st.saved, ...(s as { saved: object }).saved } as never });
    render(<ConflictDialog conflicts={[{ key: U(2), reason: 'modified' }]} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '충돌 항목만 버리고 계속' }));
    const list = await screen.findByRole('list', { name: '취소한 변경' });
    expect(list).toHaveTextContent('L3 #1 삭제');
    expect(list).toHaveTextContent('연결 삭제(함께 삭제하던 것)');
    expect(list).toHaveTextContent('북춘천-춘천 접속 해제');
    expect(screen.getByText(/삭제된 변전소를 목록에서 뺐습니다 — 춘천HP/)).toBeInTheDocument();
    workingCopyStore.getState().reset();
  });
});
