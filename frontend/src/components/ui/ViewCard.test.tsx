import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ViewCard } from './ViewCard';
import { TableSearch } from './TableSearch';
import { SegmentedControl } from './SegmentedControl';

describe('ViewCard — 머리 띠', () => {
  /* 도구가 몇 개든 검색은 **오른쪽 끝**이다 — 네 탭에서 검색의 x 가 같아야 눈이 매번
     찾지 않는다. 예전에는 현황·선번장·계통이 검색을 각각 다른 자리에 두었다. */
  it('회색 한 줄 — 도구는 왼쪽, 오른쪽 끝은 검색 자리', () => {
    const { container } = render(
      <ViewCard tools={<button type="button">배치</button>} actions={<input aria-label="검색" />}>
        본문
      </ViewCard>,
    );
    const head = container.querySelector('.bg-surface-2') as HTMLElement;
    expect(head).not.toBeNull();
    /* 뷰 탭 줄과 같은 32px — 예전에는 8·12·16px 짜리 도구바가 섞여 있었다. */
    expect(head).toHaveClass('h-8');
    expect(head).toHaveClass('px-3');
    expect(head).toHaveClass('border-b');
    const right = head.querySelector('.ml-auto') as HTMLElement;
    expect(right.querySelector('[aria-label="검색"]')).not.toBeNull();
  });

  /* 판에 이름도 도구도 검색도 없으면 띠는 **없다** — 빈 회색 줄이 한 겹 얹히면 그만큼
     판이 낮아진다. */
  it('머리에 아무것도 없으면 띠를 그리지 않는다', () => {
    const { container } = render(<ViewCard>본문</ViewCard>);
    expect(container.querySelector('.bg-surface-2')).toBeNull();
  });

  it('제목은 본문 크기로 — 상세 패널이 「무엇을 보고 있나」를 여기에 적는다', () => {
    render(<ViewCard title="통신용 충전기 #1">본문</ViewCard>);
    const title = screen.getByText('통신용 충전기 #1');
    expect(title.className).toContain('text-sm');
    expect(title.className).toContain('font-semibold');
  });
});

describe('ViewCard — 본문', () => {
  /* §1.7-b: 고정 머리글이 있는 스크롤 상자에는 여백을 **직접 주지 않는다** — 주면
     머리글이 그만큼 내려가 붙고 그 틈으로 지나가는 행이 비친다. */
  it('body="scroll" — 스크롤 상자는 카드가 쥐고 여백은 안쪽 래퍼가 갖는다', () => {
    const { container } = render(<ViewCard body="scroll">본문</ViewCard>);
    const box = container.querySelector('.overflow-auto') as HTMLElement;
    expect(box).not.toBeNull();
    expect(box.className).not.toMatch(/\bp-4\b/);
    expect((box.firstChild as HTMLElement).className).toContain('p-4');
  });

  /* 판에는 안쪽 여백을 주지 않는다 — 카드가 이미 바깥 여백(gap-3 p-4) 뒤에 서 있으므로
     한 겹 더 들여쓰면 캔버스·표가 그만큼 좁아진다. 되돌린 fcaef075 의 「여백 낭비」가 이것이었다. */
  it('body="fill" — 안쪽 여백이 없고 스크롤 상자도 아니다', () => {
    render(
      <ViewCard body="fill">
        <div data-testid="판" />
      </ViewCard>,
    );
    const box = screen.getByTestId('판').parentElement as HTMLElement;
    expect(box.className).not.toMatch(/\bp-\d/);
    expect(box).toHaveClass('overflow-hidden');
  });

  it('기본은 fill — 부르는 쪽이 아무 말 안 하면 판이다', () => {
    const { container } = render(
      <ViewCard>
        <div />
      </ViewCard>,
    );
    expect(container.querySelector('.overflow-auto')).toBeNull();
  });
});

describe('ViewCard — 선택과 바닥', () => {
  /* §1.7-d 「고른 것을 놓는 방법은 앱 전체가 하나」 — 본문 여백을 눌러도 풀린다.
     스무 줄 아래에서 고른 줄을 다시 찾아 누르는 것보다 여백을 누르는 편이 빠르다. */
  it('본문 여백을 누르면 고른 것을 놓는다', () => {
    const onClear = vi.fn();
    const { container } = render(
      <ViewCard body="scroll" onClearSelection={onClear}>
        <button type="button">줄</button>
      </ViewCard>,
    );
    fireEvent.pointerDown(container.querySelector('.overflow-auto') as HTMLElement);
    expect(onClear).toHaveBeenCalled();
  });

  /* 누를 수 있는 것 위에서는 풀리지 않는다 — SelectionScope 가 이미 가려낸다. */
  it('줄을 누르는 것은 「여백을 누른 것」이 아니다', () => {
    const onClear = vi.fn();
    render(
      <ViewCard body="scroll" onClearSelection={onClear}>
        <button type="button">줄</button>
      </ViewCard>,
    );
    fireEvent.pointerDown(screen.getByText('줄'));
    expect(onClear).not.toHaveBeenCalled();
  });

  it('바닥 띠는 준 것만 선다', () => {
    const { rerender } = render(<ViewCard>본문</ViewCard>);
    expect(screen.queryByTestId('상태줄')).toBeNull();
    rerender(<ViewCard status={<div data-testid="상태줄" />}>본문</ViewCard>);
    expect(screen.getByTestId('상태줄')).not.toBeNull();
  });
});

describe('TableSearch — 입력칸은 흔들리지 않는다', () => {
  /**
   * 건수는 입력칸 **왼쪽**에 선다.
   *
   * 머리 띠의 오른쪽 끝은 `ml-auto` 로 밀려 있다. 건수가 입력칸 **오른쪽**에 있으면,
   * 글자를 치는 순간 「39 / 78건」이 나타나면서 입력칸이 그 폭만큼 왼쪽으로 튄다 —
   * 치는 도중에 칸이 움직이는 화면이 된다.
   */
  it('건수는 입력칸 앞에 선다', () => {
    const { container } = render(
      <TableSearch aria-label="현황 검색" placeholder="검색" value="가" onChange={() => {}} shown={3} total={9} />,
    );
    const row = container.firstChild as HTMLElement;
    const kids = Array.from(row.children) as HTMLElement[];
    expect(kids[0]?.textContent).toBe('3 / 9건');
    expect(kids[1]?.querySelector('input')).not.toBeNull();
  });

  /* 안 거를 때의 수는 화면이 이미 말하고 있는 것을 되풀이할 뿐이다. */
  it('거르지 않을 때는 건수를 적지 않는다', () => {
    const { container } = render(
      <TableSearch aria-label="현황 검색" placeholder="검색" value="" onChange={() => {}} shown={9} total={9} />,
    );
    expect(container.textContent).not.toContain('건');
  });
});

describe('SegmentedControl — 갈래는 탭이 아니다', () => {
  /**
   * 탭은 **다른 내용**으로 건너가는 것이고 갈래는 **같은 내용을 거르는** 것이다.
   * 생김새를 탭과 같이 두면 위계가 안 읽힌다 — 계통의 `전체·교류·직류` 가 뷰 탭과
   * 똑같은 사각 탭이었고, 도구바 안에 있느라 상위 탭보다 14px 더 높기까지 했다.
   */
  it('radiogroup 이다 — 고른 하나만 checked', () => {
    render(
      <SegmentedControl
        aria-label="갈래"
        items={[{ key: 'all', label: '전체' }, { key: 'AC', label: '교류' }]}
        value="AC"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('radiogroup', { name: '갈래' })).not.toBeNull();
    expect(screen.getByRole('radio', { name: '교류' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '전체' })).toHaveAttribute('aria-checked', 'false');
  });

  it('누르면 그 갈래를 알린다', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        aria-label="갈래"
        items={[{ key: 'all', label: '전체' }, { key: 'AC', label: '교류' }]}
        value="all"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: '교류' }));
    expect(onChange).toHaveBeenCalledWith('AC');
  });

  /* 머리 띠의 다른 컨트롤과 같은 높이 — 24px(`controlSize.ts` 의 `sm`). */
  it('컨트롤 높이 규격을 따른다', () => {
    render(
      <SegmentedControl aria-label="갈래" items={[{ key: 'all', label: '전체' }]} value="all" onChange={() => {}} />,
    );
    expect(screen.getByRole('radio', { name: '전체' })).toHaveClass('h-6');
  });
});
