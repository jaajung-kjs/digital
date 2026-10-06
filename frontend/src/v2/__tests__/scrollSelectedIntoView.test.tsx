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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { selectableRow, useScrollSelectedIntoView } from '../../components/ui';

function Table({ selected }: { selected: string | null }) {
  const ref = useScrollSelectedIntoView<HTMLDivElement>(selected);
  return (
    <div ref={ref}>
      <table>
        <thead>
          <tr style={{ position: 'sticky' }} data-head>머리글</tr>
        </thead>
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

  /* 머리글이 붙박이면 그 아래로 밀려 들어가 정작 안 보인다 — 그만큼 여백을 둬야 한다.
     높이는 재서 쓴다(머리글이 한 줄인지 두 줄인지는 표마다 다르다). */
  it('붙박이 머리글 높이만큼 여백을 두고 멈춘다', () => {
    watchScroll();
    Element.prototype.getBoundingClientRect = function rect(this: Element) {
      return { height: this.hasAttribute('data-head') ? 48 : 36 } as DOMRect;
    };
    const { container } = render(<Table selected="b" />);
    const row = container.querySelector('[data-row="b"]') as HTMLElement;
    expect(row.style.scrollMarginTop).toBe('48px');
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

/* 트리는 맥락이 필요해 가운데로 옮기지만, **이미 보이는 줄을 누를 때마다** 가운데로 끌면
   누른 자리가 손 밑에서 달아난다(조직 트리가 클릭마다 출렁였다). 보이면 가만히. */
describe("useScrollSelectedIntoView — 'center-if-needed'", () => {
  function List({ selected }: { selected: string }) {
    const ref = useScrollSelectedIntoView<HTMLDivElement>(selected, 'center-if-needed');
    return (
      <div ref={ref} data-box style={{ overflowY: 'auto' }}>
        {['a', 'b', 'z'].map((id) => (
          <div key={id} data-row={id} {...selectableRow(selected, id, () => {})}>{id}</div>
        ))}
      </div>
    );
  }
  /** 상자는 0~100px, a·b 는 그 안, z 는 아래로 벗어난 줄. */
  const RECTS: Record<string, { top: number; bottom: number; height: number }> = {
    box: { top: 0, bottom: 100, height: 100 },
    a: { top: 0, bottom: 28, height: 28 },
    b: { top: 28, bottom: 56, height: 28 },
    z: { top: 300, bottom: 328, height: 28 },
  };
  const original = Element.prototype.getBoundingClientRect;
  afterEach(() => { Element.prototype.getBoundingClientRect = original; });

  function measure(boxHeight = 100) {
    Element.prototype.getBoundingClientRect = function rect(this: Element) {
      if (this.hasAttribute('data-box')) return { ...RECTS.box, height: boxHeight } as DOMRect;
      return RECTS[this.getAttribute('data-row') ?? ''] as DOMRect;
    };
  }

  it('보이는 줄은 옮기지 않는다', () => {
    const calls = watchScroll();
    measure();
    const { rerender } = render(<List selected="a" />);
    rerender(<List selected="b" />);
    expect(calls).toEqual([]);
  });

  it('상자 밖의 줄은 옮긴다', () => {
    const calls = watchScroll();
    measure();
    const { rerender } = render(<List selected="a" />);
    rerender(<List selected="z" />);
    expect(calls).toEqual(['z']);
  });

  it('상자를 아직 잴 수 없으면(첫 화면) 옮긴다', () => {
    const calls = watchScroll();
    measure(0);
    render(<List selected="b" />);
    expect(calls).toEqual(['b']);
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
