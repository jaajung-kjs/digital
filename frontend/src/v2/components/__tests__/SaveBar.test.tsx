import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SaveBar } from '../SaveBar';
import { workingCopyStore } from '../../model/store/workingCopy';

afterEach(() => workingCopyStore.getState().reset());
const dirtyOne = () =>
  workingCopyStore.getState().create('racks', { id: 'r1', substationId: 'S1', name: 'R', rackTypeId: 't' } as never);

describe('SaveBar', () => {
  it('흠이 있으면 저장 단추가 잠기고 문구가 뜬다', () => {
    dirtyOne();
    render(<SaveBar onCommit={() => {}} isCommitting={false} substationNames={[]} issue="이름이 겹칩니다" />);
    expect(screen.getByText('이름이 겹칩니다')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  });
  it('변경이 있으면 저장 옆에 「설계서」 단추가 선다', () => {
    dirtyOne();
    render(<SaveBar onCommit={() => {}} isCommitting={false} substationNames={[]} issue={null} />);
    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    expect(buttons.slice(-2)).toEqual(['설계서', '저장']);
  });
  it('변경이 닿은 국 이름을 보인다', () => {
    dirtyOne();
    render(<SaveBar onCommit={() => {}} isCommitting={false} substationNames={['북춘천S/S', '춘천H/P']} issue={null} />);
    expect(screen.getByText(/북춘천S\/S·춘천H\/P/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '저장' })).toBeEnabled();
  });
  it('저장 중에는 되돌리기·실행 취소가 잠기고 ⌘Z 도 듣지 않는다', () => {
    dirtyOne();
    workingCopyStore.getState().update('racks', 'r1', { name: 'R2' } as never);
    render(<SaveBar onCommit={() => {}} isCommitting substationNames={[]} issue={null} />);
    expect(screen.getByRole('button', { name: '실행 취소 — 저장 중입니다' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '변경 취소' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '저장 중…' })).toBeDisabled();
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(workingCopyStore.getState().overlays.racks.creates.r1!.name).toBe('R2');
  });
});
