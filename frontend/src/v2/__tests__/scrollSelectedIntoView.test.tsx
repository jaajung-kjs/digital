/**
 * 고른 줄을 화면 안으로 — **표마다 새로 적지 않는다.**
 *
 * 어느 줄이 골라졌는지는 표가 이미 `aria-selected` 로 말해 두었다(`selectableRow`). 훅은 그
 * 표시를 찾아 옮길 뿐이라, 현황·선번장·계통 셋이 같은 한 줄로 끝난다.
 *
 * 여기서 지키는 것은 셋이다: ① 고른 것이 있으면 그 줄을 옮긴다 ② 고른 것이 바뀔 때만 옮긴다
 * (그리기마다 옮기면 사람이 표를 굴려 다른 데를 보고 있어도 화면이 자꾸 되돌아온다)
 * ③ 안 골랐으면 아무것도 안 한다.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { selectableRow, useScrollSelectedIntoView } from '../../components/ui';

function Table({ selected }: { selected: string | null }) {
  const ref = useScrollSelectedIntoView<HTMLDivElement>(selected);
  return (
    <div ref={ref}>
      <table>
        <tbody>
          {['a', 'b', 'c'].map((id) => (
            <tr key={id} data-row={id} {...selectableRow(selected, id, () => {})}>
              <td>{id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** jsdom 에는 `scrollIntoView` 가 없다 — 어느 줄에서 불렸는지를 그대로 받아 적는다. */
function watchScroll() {
  const calls: string[] = [];
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
    calls.push(this.getAttribute('data-row') ?? '?');
  };
  return calls;
}

describe('useScrollSelectedIntoView', () => {
  it('고른 줄을 화면 안으로 옮긴다', () => {
    const calls = watchScroll();
    render(<Table selected="b" />);
    expect(calls).toEqual(['b']);
  });

  it('고른 것이 바뀔 때만 옮긴다 — 같은 값으로 다시 그려도 가만히 둔다', () => {
    const calls = watchScroll();
    const { rerender } = render(<Table selected="b" />);
    rerender(<Table selected="b" />);
    expect(calls).toEqual(['b']);

    rerender(<Table selected="c" />);
    expect(calls).toEqual(['b', 'c']);
  });

  it('아무것도 안 골랐으면 옮기지 않는다', () => {
    const calls = watchScroll();
    render(<Table selected={null} />);
    expect(calls).toEqual([]);
  });

  it('고른 줄이 그려지지 않았으면 아무 일도 없다 — 접힌 묶음 속이거나 걸러진 줄', () => {
    const calls = watchScroll();
    render(<Table selected="없는줄" />);
    expect(calls).toEqual([]);
  });
});

/* 스크린리더가 읽는 표시를 그대로 쓰는 것이 이 훅의 요점이다 — 표가 따로 표를 달지 않아도
   된다. 그 표시가 사라지면 훅이 조용히 아무것도 안 하게 되므로 여기서 함께 못 박는다. */
describe('selectableRow 는 고른 줄에 aria-selected 를 단다', () => {
  it('고른 줄만 true 다', () => {
    vi.stubGlobal('scrollIntoView', () => {});
    const { container } = render(<Table selected="b" />);
    const marked = [...container.querySelectorAll('[aria-selected="true"]')]
      .map((el) => el.getAttribute('data-row'));
    expect(marked).toEqual(['b']);
  });
});
