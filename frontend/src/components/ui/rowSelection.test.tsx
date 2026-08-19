/**
 * 줄은 **어디를 눌러도** 골라진다 — 그 안의 조작기를 누른 때만 비켜준다.
 *
 * 예전에는 칸을 고치는 셀이 `onClick={e => e.stopPropagation()}` 로 셀 통째로 클릭을 삼켰다.
 * 그러면 그 셀의 **여백까지** 죽는다 — 계통 표는 일곱 칸 중 셋이 그랬고, 하필 줄 한가운데라
 * 줄을 누르려던 사람에게는 「클릭이 안 되는 표」였다.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { selectableRow } from './rowSelection';

function Row({ onSelect, selected = null }: { onSelect: (id: string | null) => void; selected?: string | null }) {
  return (
    <table>
      <tbody>
        <tr {...selectableRow(selected, 'r1', onSelect)}>
          <td>회로 1</td>
          <td data-testid="control-cell">
            <span>여백</span>
            <button type="button" onClick={() => {}}>개폐</button>
          </td>
          <td>
            <input aria-label="길이" defaultValue="10" />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

describe('selectableRow', () => {
  it('평범한 칸을 누르면 골라진다', () => {
    const onSelect = vi.fn();
    render(<Row onSelect={onSelect} />);
    fireEvent.click(screen.getByText('회로 1'));
    expect(onSelect).toHaveBeenCalledWith('r1');
  });

  /* 이것이 계통 표의 회귀 시험이다 — 조작기가 든 셀이라도 **그 조작기가 아닌 자리**는 줄의 것이다. */
  it('조작기가 든 셀이라도 여백을 누르면 골라진다', () => {
    const onSelect = vi.fn();
    render(<Row onSelect={onSelect} />);
    fireEvent.click(screen.getByText('여백'));
    expect(onSelect).toHaveBeenCalledWith('r1');
  });

  it('단추를 누르면 줄은 골라지지 않는다', () => {
    const onSelect = vi.fn();
    render(<Row onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: '개폐' }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('입력칸을 누르면 줄은 골라지지 않는다', () => {
    const onSelect = vi.fn();
    render(<Row onSelect={onSelect} />);
    fireEvent.click(screen.getByLabelText('길이'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  /* 고른 것을 다시 누르면 풀린다 — 앱 공통 규칙. */
  it('고른 줄을 다시 누르면 풀린다', () => {
    const onSelect = vi.fn();
    render(<Row onSelect={onSelect} selected="r1" />);
    fireEvent.click(screen.getByText('회로 1'));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
