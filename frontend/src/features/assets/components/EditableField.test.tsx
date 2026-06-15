import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditableField } from './EditableField';

describe('EditableField', () => {
  it('읽기모드: 값 표시 + ✎ 버튼, 입력창 없음', () => {
    render(<EditableField value="보호" ariaLabel="용도" onCommit={() => {}} />);
    expect(screen.getByText('보호')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /수정/ })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
  it('✎ 클릭 → 입력, Enter → onCommit(변경값)', () => {
    const onCommit = vi.fn();
    render(<EditableField value="보호" ariaLabel="용도" onCommit={onCommit} />);
    fireEvent.click(screen.getByRole('button', { name: /수정/ }));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '예비' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith('예비');
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
  it('Esc → 취소(onCommit 미호출)', () => {
    const onCommit = vi.fn();
    render(<EditableField value="보호" ariaLabel="용도" onCommit={onCommit} />);
    fireEvent.click(screen.getByRole('button', { name: /수정/ }));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '예비' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
  });
  it('select: onChange → onCommit', () => {
    const onCommit = vi.fn();
    render(<EditableField value="" type="select" ariaLabel="융착"
      options={[{ value: '', label: '—' }, { value: '융착', label: '융착' }]} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole('button', { name: /수정/ }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '융착' } });
    expect(onCommit).toHaveBeenCalledWith('융착');
  });
  it('date: onChange → onCommit 단 1회(이중커밋 없음)', () => {
    const onCommit = vi.fn();
    render(<EditableField value="2026-01-01" type="date" ariaLabel="설치일" onCommit={onCommit} />);
    fireEvent.click(screen.getByRole('button', { name: /수정/ }));
    const input = screen.getByLabelText('설치일');
    fireEvent.change(input, { target: { value: '2026-02-02' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith('2026-02-02');
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
  it('disabled: ✎ 없음', () => {
    render(<EditableField value="" ariaLabel="용도" disabled onCommit={() => {}} />);
    expect(screen.queryByRole('button', { name: /수정/ })).toBeNull();
  });
});
