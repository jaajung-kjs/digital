import { act, render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { AssemblyGrid, type GridItem } from './AssemblyGrid';

/**
 * **끈 것은 누른 것이 아니다.**
 *
 * 실제로 이렇게 깨졌다: 자리를 옮기면 자산 추가 모달이 열리고, 크기를 조절하면 아무 말 없이
 * 그 자산의 상세 패널로 튀었다. 칸마다 pointer 핸들러가 붙고 그 위에 `onClick` 이 따로 있어
 * 한 번의 손짓이 두 번 해석됐기 때문이다(손잡이의 pointerup 이 버튼으로 버블링, 캡처가 풀리면
 * click 이 엉뚱한 빈 칸에서 발생).
 *
 * 손짓의 판정이 한 곳뿐이라는 것을 여기서 못박는다.
 */

const items: GridItem[] = [
  { id: 'a', name: '광단말 A', col: 0, row: 0, colSpan: 1, rowSpan: 2 },
];

/** jsdom 은 포인터 캡처를 구현하지 않는다 — 없다고 터지지만 않으면 된다. */
beforeAll(() => {
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      disconnect() {}
    };
  }
});

function setup(over: Partial<Parameters<typeof AssemblyGrid<GridItem>>[0]> = {}) {
  const onSelect = vi.fn();
  const onAddAtCell = vi.fn();
  const onMove = vi.fn();
  const { container } = render(
    <AssemblyGrid
      grid={{ cols: 2, rows: 4 }}
      items={items}
      onSelect={onSelect}
      onAddAtCell={onAddAtCell}
      onMove={onMove}
      canPlace={() => true}
      {...over}
    />,
  );
  const grid = screen.getByRole('list');
  /* jsdom 은 레이아웃이 없어 getBoundingClientRect 가 전부 0 이다 — 칸을 셈하려면 크기를 준다. */
  grid.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 100, height: 200 }) as DOMRect;
  return { onSelect, onAddAtCell, onMove, grid, container };
}

const item = () => screen.getByRole('button', { name: /광단말 A/ });
const emptyCell = () => screen.getAllByRole('button', { name: /비어 있음/ })[0]!;

/**
 * 칸 (col,row) 한가운데를 가리키는 포인터 이벤트.
 *
 * jsdom 에는 `PointerEvent` 가 없어 testing-library 가 밋밋한 `Event` 로 떨어뜨리는데, 그러면
 * `button` 이 사라져 「왼쪽 버튼으로 눌렀나」 판정에 걸린다. `MouseEvent` 로 직접 만든다 —
 * 타입 이름만 pointer 계열이면 React 가 그대로 pointer 핸들러로 보낸다.
 */
const pointer = (type: string, el: Element | Window, col: number, row: number, buttons?: number) =>
  fireEvent(el, new MouseEvent(type, {
    bubbles: true, cancelable: true, button: 0,
    /* 끄는 동안에는 버튼이 눌려 있다 — 화면은 이 값으로 「우리가 못 본 사이에 손을 뗐나」를
       가린다(창 밖에서 놓으면 `pointerup` 이 오지 않는다). 손을 뗄 때만 0 이다. */
    buttons: buttons ?? (type === 'pointerup' ? 0 : 1),
    clientX: col * 50 + 25, clientY: row * 50 + 25,
  }));

/**
 * 고른 것을 **푸는 길** — 격자가 갖는다.
 *
 * 쓰는 곳마다 따로 달면 한 곳을 빠뜨린다(실제로 설비 편집기만 빠져서, 한 번 고르면 푸는
 * 길이 아예 없었다). 여기서 잠가 둔다.
 */
describe('AssemblyGrid 선택 해제', () => {
  it('Esc 를 누르면 푼다', () => {
    const onDeselect = vi.fn();
    setup({ selectedId: 'a', onDeselect });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onDeselect).toHaveBeenCalledTimes(1);
  });

  it('고른 것이 없으면 Esc 는 아무 일도 하지 않는다', () => {
    const onDeselect = vi.fn();
    setup({ selectedId: null, onDeselect });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onDeselect).not.toHaveBeenCalled();
  });

  it('상자의 빈 곳을 누르면 푼다', () => {
    const onDeselect = vi.fn();
    const { grid } = setup({ selectedId: 'a', onDeselect });
    // 격자를 감싼 상자 — 그 자신을 눌렀을 때만(칸 위에서 시작한 손짓은 칸이 받는다).
    const box = grid.closest('div')!.parentElement!;
    fireEvent(box, new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
    expect(onDeselect).toHaveBeenCalledTimes(1);
  });

  /* 이것이 「설비 편집기에서 드래그가 가끔만 먹는다」의 회귀 테스트다.
     한때는 고른 것이 있으면 빈 칸을 눌러도 **풀기만** 하고 한 번 더 눌러야 채웠다. 그런데 이
     판에서 빈 칸은 「다른 데」가 아니라 놓을 자리다 — 장비를 고쳐 놓고 옆 칸에 하나 더 넣으려던
     손짓이 매번 삼켜졌다. 푸는 길은 따로 있다(Esc·고른 것 다시 누르기). */
  it('고른 것이 있어도 빈 칸을 누르면 곧바로 채운다', () => {
    const onDeselect = vi.fn();
    const { onAddAtCell, grid } = setup({ selectedId: 'a', onDeselect });
    pointer('pointerdown', emptyCell(), 1, 3);
    pointer('pointerup', grid, 1, 3);
    expect(onAddAtCell).toHaveBeenCalledTimes(1);
    expect(onDeselect).not.toHaveBeenCalled();
  });

  /* 이것이 「빠르게 끌면 끌어 놓은 자리가 버려진다」의 회귀 테스트다.
     마지막 `pointermove` 와 `pointerup` 이 **한 작업 안에** 몰려 들어오면(빠른 손짓·좌표
     합쳐짐) 아직 반영되지 않은 상태를 읽게 된다 — 손짓이 끝날 때 읽는 값은 ref 여야 한다.
     `fireEvent` 는 하나씩 flush 하므로, 여기서는 둘을 같은 `act` 안에서 보낸다. */
  it('한 작업에 몰려 들어와도 끌어 놓은 자리를 잃지 않는다', () => {
    const { onAddAtCell, grid } = setup();
    const raw = (type: string, el: Element | Window, col: number, row: number, buttons = 1) =>
      el.dispatchEvent(new MouseEvent(type, {
        bubbles: true, cancelable: true, button: 0, buttons,
        clientX: col * 50 + 25, clientY: row * 50 + 25,
      }));
    pointer('pointerdown', emptyCell(), 1, 0);
    act(() => {
      raw('pointermove', grid, 1, 3);
      raw('pointerup', grid, 1, 3, 0);
    });
    expect(onAddAtCell).toHaveBeenCalledWith({ col: 1, row: 0, colSpan: 1, rowSpan: 4 });
  });

  /* 만들기와 **같은 부류**다: 옮기기도 끝날 때 미리보기를 읽는다. 한쪽만 ref 로 고치면
     다른 쪽이 조용히 남는다. */
  it('한 작업에 몰려 들어와도 옮긴 자리를 잃지 않는다', () => {
    const { onMove, grid } = setup();
    const raw = (type: string, el: Element | Window, col: number, row: number, buttons = 1) =>
      el.dispatchEvent(new MouseEvent(type, {
        bubbles: true, cancelable: true, button: 0, buttons,
        clientX: col * 50 + 25, clientY: row * 50 + 25,
      }));
    pointer('pointerdown', item(), 0, 0);
    act(() => {
      raw('pointermove', grid, 1, 2);
      raw('pointerup', grid, 1, 2, 0);
    });
    expect(onMove).toHaveBeenCalledWith('a', { col: 1, row: 2, colSpan: 1, rowSpan: 2 });
  });

  /* 여러 칸을 묶어 끌면 **그 크기까지** 부르는 쪽에 간다. 한때 자리(col,row)만 넘겨받고
     크기는 상자가 1×1 로 못 박아, 끌어서 잡은 크기가 조용히 버려졌다. */
  it('여러 칸을 묶어 끌면 그 크기가 함께 간다', () => {
    const { onAddAtCell, grid } = setup();
    /* `emptyCell()` 은 첫 빈 칸(1,0)이다 — 시작 칸은 좌표가 아니라 그 칸이 알린다. */
    pointer('pointerdown', emptyCell(), 1, 0);
    pointer('pointermove', grid, 1, 3);
    pointer('pointerup', grid, 1, 3);
    expect(onAddAtCell).toHaveBeenCalledWith({ col: 1, row: 0, colSpan: 1, rowSpan: 4 });
  });

  /* 무엇을 넣을지 묻는 동안 그 네모는 판에 남는다 — 상자가 「어디에, 얼마만 한 크기로」를
     묻는데 정작 그 답이 화면에서 사라지면 기억에 의존하게 된다. */
  it('묻는 중인 자리는 판에 남는다', () => {
    /* 글자는 칸이 넓을 때만 들어간다(jsdom 에는 레이아웃이 없어 늘 좁은 쪽으로 떨어진다) —
       여기서 재는 것은 **그 네모가 그 자리에 그 크기로 남아 있는가**다. */
    const { container } = setup({ pending: { at: { col: 2, row: 1, colSpan: 2, rowSpan: 3 }, label: '새 자산' } });
    const rect = container.querySelector('li[style*="span 2"][style*="span 3"]');
    expect(rect).toBeTruthy();
    expect(rect!.getAttribute('style')).toContain('3 / span 2'); // 3열(1-based)에서 두 칸
  });

  /* 이것이 「키보드로 이 판을 지나가려면 Tab 을 196번 눌러야 한다」의 회귀 테스트다.
     판은 **하나의 정거장**이고 그 안은 화살표로 옮긴다(WAI-ARIA roving tabindex). */
  it('Tab 으로 닿는 칸은 하나뿐이다 — 나머지는 화살표로 온다', () => {
    setup();
    const cells = screen.getAllByRole('button').filter((b) => b.hasAttribute('data-cell'));
    expect(cells.length).toBeGreaterThan(4);
    expect(cells.filter((b) => b.tabIndex === 0)).toHaveLength(1);
  });

  it('화살표로 옆 칸에 간다 — 그 칸이 정거장을 이어받는다', () => {
    setup();
    const cells = screen.getAllByRole('button').filter((b) => b.hasAttribute('data-cell'));
    const start = cells.find((b) => b.tabIndex === 0)!;
    fireEvent.keyDown(start, { key: 'ArrowDown' });
    const now = screen.getAllByRole('button').filter((b) => b.hasAttribute('data-cell'));
    const stop = now.filter((b) => b.tabIndex === 0);
    expect(stop).toHaveLength(1);
    expect(stop[0]!.dataset.cell).not.toBe(start.dataset.cell);
  });

  it('고른 것이 없으면 빈 칸을 누르는 것이 곧 채우기다', () => {
    const onDeselect = vi.fn();
    const { onAddAtCell, grid } = setup({ selectedId: null, onDeselect });
    pointer('pointerdown', emptyCell(), 1, 3);
    pointer('pointerup', grid, 1, 3);
    expect(onAddAtCell).toHaveBeenCalled();
    expect(onDeselect).not.toHaveBeenCalled();
  });

  /* 키보드도 같은 판정을 거쳐야 한다 — 예전에는 여기서 규칙을 다시 써서 손짓에만 있었다. */
  it('키보드(Enter)도 같은 규칙을 따른다', () => {
    const onDeselect = vi.fn();
    const { onAddAtCell } = setup({ selectedId: 'a', onDeselect });
    fireEvent.keyDown(emptyCell(), { key: 'Enter' });
    expect(onAddAtCell).toHaveBeenCalledTimes(1);
    expect(onDeselect).not.toHaveBeenCalled();
  });

  it('칸을 누른 것은 해제가 아니다 — 고르기다', () => {
    const onDeselect = vi.fn();
    const { onSelect, grid } = setup({ selectedId: 'a', onDeselect });
    pointer('pointerdown', item(), 0, 0);
    pointer('pointerup', grid, 0, 0);
    expect(onSelect).toHaveBeenCalled();
    expect(onDeselect).not.toHaveBeenCalled();
  });
});

describe('AssemblyGrid 빼기', () => {
  /* **누르는 순간 지우지 않는다** — 잘못 눌렀으면 손가락을 밖으로 빼서 물릴 수 있어야 한다
     (단추의 기본 규칙). 누름은 끌기를 가로채기만 하고, 지우는 것은 뗄 때다. */
  it('호버 X 는 눌러도 아직 안 지우고, 떼야 뺀다', () => {
    const onRemove = vi.fn();
    setup({ onRemove });
    const x = screen.getByRole('button', { name: '광단말 A 빼기' });
    fireEvent(x, new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
    expect(onRemove).not.toHaveBeenCalled();
    fireEvent.click(x);
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  /* 빼기 단추는 손이 얹혀야 나타난다 — 키보드에는 그 길이 없으므로 고른 칸에서 Delete 로 뺀다. */
  it('고른 칸에서 Delete 로도 뺀다', () => {
    const onRemove = vi.fn();
    setup({ onRemove });
    fireEvent.keyDown(screen.getByRole('button', { name: /광단말 A,/ }), { key: 'Delete' });
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  /**
   * **네모는 빈 자리에서만 자란다.**
   *
   * 예전에는 남의 자리까지 덮도록 두고 빨갛게 칠한 뒤, 손을 떼면 아무 일도 하지 않았다 —
   * 사람 눈에는 「끌었는데 아무 반응 없이 사라졌다」이고, 무엇이 잘못인지 말할 자리도 없었다.
   */
  it('빈 칸에서 끌다 다른 장비를 만나면 그 앞에서 멈춘다 — 아무 일도 없는 경우는 없다', () => {
    const onAddAtCell = vi.fn();
    const { grid } = setup({
      onAddAtCell,
      /* 광단말 A 를 3행에 세운다 — 아래로 끌면 그것을 만난다. */
      items: [{ id: 'a', name: '광단말 A', col: 0, row: 2, colSpan: 1, rowSpan: 1 }],
    });
    /* 1행 1열에서 눌러 아래로 끈다: 2행까지는 비었고 3행은 막혀 있다. */
    pointer('pointerdown', screen.getByRole('button', { name: /1행 1열, 비어 있음/ }), 0, 0);
    pointer('pointermove', grid, 0, 1);
    pointer('pointermove', grid, 0, 3);
    pointer('pointerup', grid, 0, 3);
    /* 막힌 칸을 덮지 않은 네모(1×2)로 만든다 — 조용히 사라지지 않는다. */
    expect(onAddAtCell).toHaveBeenCalledWith(expect.objectContaining({ col: 0, row: 0, colSpan: 1, rowSpan: 2 }));
  });

  /* 지우려고 누른 것이 끌기로 읽히면, 손을 떼는 순간 자리가 바뀌어 있다. */
  it('X 를 누른 것은 칸의 손짓(이동)을 일으키지 않는다', () => {
    const { onMove, onSelect } = setup({ onRemove: vi.fn() });
    fireEvent(
      screen.getByRole('button', { name: '광단말 A 빼기' }),
      new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }),
    );
    expect(onMove).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('뺄 길을 주지 않으면 X 가 없다 — 읽기 전용 판', () => {
    setup({});
    expect(screen.queryByRole('button', { name: /빼기/ })).toBeNull();
  });
});

describe('AssemblyGrid 손짓', () => {
  it('끌지 않고 누르면 고른다', () => {
    const { onSelect, onMove, onAddAtCell, grid } = setup();
    pointer('pointerdown', item(), 0, 0);
    pointer('pointerup', grid, 0, 0);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onMove).not.toHaveBeenCalled();
    expect(onAddAtCell).not.toHaveBeenCalled();
  });

  it('빈 자리를 누르면 그 칸에 채운다', () => {
    const { onAddAtCell, onSelect, grid } = setup();
    pointer('pointerdown', emptyCell(), 1, 0);
    pointer('pointerup', grid, 1, 0);
    expect(onAddAtCell).toHaveBeenCalledWith({ col: 1, row: 0 });
    expect(onSelect).not.toHaveBeenCalled();
  });

  /* 이것이 「옮겼는데 자산 추가 모달이 열린다」의 회귀 테스트다. */
  it('끌어서 옮기면 옮기기만 한다 — 고르지도, 추가하지도 않는다', () => {
    const { onMove, onSelect, onAddAtCell, grid } = setup();
    pointer('pointerdown', item(), 0, 0);
    pointer('pointermove', grid, 1, 2);
    pointer('pointerup', grid, 1, 2);
    expect(onMove).toHaveBeenCalledWith('a', { col: 1, row: 2, colSpan: 1, rowSpan: 2 });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onAddAtCell).not.toHaveBeenCalled();
  });

  /* 이것이 「크기를 조절했는데 상세 패널로 튄다」의 회귀 테스트다. */
  it('크기를 조절하면 조절만 한다 — 고르지 않는다', () => {
    const { onMove, onSelect, grid } = setup();
    pointer('pointerdown', screen.getByRole('separator', { name: /크기 조절/ }), 0, 0);
    pointer('pointermove', grid, 1, 3);
    pointer('pointerup', grid, 1, 3);
    expect(onMove).toHaveBeenCalledWith('a', { col: 0, row: 0, colSpan: 2, rowSpan: 4 });
    expect(onSelect).not.toHaveBeenCalled();
  });

  /* 창 밖에서 손을 떼면 `pointerup` 이 오지 않는다(캡처가 풀린다). 그러면 손짓이 살아 있는
     채로 남아, 돌아왔을 때 버튼을 누르지도 않았는데 장비가 커서를 따라다녔다. */
  it('못 본 사이에 손을 뗐으면 물린다 — 돌아와도 따라다니지 않는다', () => {
    const { onMove, onSelect, grid } = setup();
    pointer('pointerdown', item(), 0, 0);
    pointer('pointermove', grid, 1, 2);
    pointer('pointermove', grid, 1, 3, 0); // 창 밖에서 뗀 손이 돌아왔다
    pointer('pointermove', grid, 1, 4);
    pointer('pointerup', grid, 1, 4);
    expect(onMove).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('놓을 수 없는 자리면 옮기지 않는다 — 고르지도 않는다', () => {
    const { onMove, onSelect, grid } = setup({ canPlace: () => false });
    pointer('pointerdown', item(), 0, 0);
    pointer('pointermove', grid, 1, 2);
    pointer('pointerup', grid, 1, 2);
    expect(onMove).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('ESC 로 물리면 옮기지 않는다 — 손을 떼도 그대로다', () => {
    const { onMove, onSelect, grid } = setup();
    pointer('pointerdown', item(), 0, 0);
    pointer('pointermove', grid, 1, 2);
    fireEvent.keyDown(window, { key: 'Escape' });
    pointer('pointerup', grid, 1, 2);
    expect(onMove).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('키보드(Enter)로도 고를 수 있다 — 손짓과 다른 길이다', () => {
    const { onSelect, onMove } = setup();
    fireEvent.keyDown(item(), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onMove).not.toHaveBeenCalled();
  });
});
