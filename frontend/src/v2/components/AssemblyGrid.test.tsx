import { render, screen, fireEvent } from '@testing-library/react';
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
  render(
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
  return { onSelect, onAddAtCell, onMove, grid };
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
const pointer = (type: string, el: Element | Window, col: number, row: number) =>
  fireEvent(el, new MouseEvent(type, {
    bubbles: true, cancelable: true, button: 0,
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

  it('칸을 누른 것은 해제가 아니다 — 고르기다', () => {
    const onDeselect = vi.fn();
    const { onSelect, grid } = setup({ selectedId: 'a', onDeselect });
    pointer('pointerdown', item(), 0, 0);
    pointer('pointerup', grid, 0, 0);
    expect(onSelect).toHaveBeenCalled();
    expect(onDeselect).not.toHaveBeenCalled();
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
