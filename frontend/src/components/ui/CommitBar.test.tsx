import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CommitBar } from './CommitBar';

describe('CommitBar', () => {
  it('dirty 건수·버튼 렌더, onCommit/onRevert 호출', () => {
    const onCommit = vi.fn(); const onRevert = vi.fn();
    render(<CommitBar dirty={3} onCommit={onCommit} onRevert={onRevert} />);
    expect(screen.getByText('저장 3건')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onRevert).toHaveBeenCalledOnce();
  });
  it('busy 면 버튼 disabled', () => {
    render(<CommitBar dirty={1} busy onCommit={() => {}} onRevert={() => {}} />);
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeDisabled();
  });
});
