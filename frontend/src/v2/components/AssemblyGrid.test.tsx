/**
 * 격자에서 **우리가 책임지는 것**만 잠근다.
 *
 * 끌기·크기·겹침은 `react-grid-layout` 이 맡는다 — 손으로 짠 포인터 코드를 오래 고쳤지만
 * 캡처가 언제 풀리는지, 칸 사이 틈을 누르면 어디로 치는지, 끝을 알리는 신호가 뗌보다 먼저
 * 오는지가 브라우저·프레임워크마다 달라 계속 졌다. 그 일은 라이브러리의 몫이고, 그것까지
 * 여기서 시험하면 라이브러리를 시험하는 것이 된다.
 *
 * 여기 남는 것: 빈 칸을 눌러 만들기, 놓인 것을 눌러 고르기, 빼기, Esc, 눈금.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { AssemblyGrid, type GridItem } from './AssemblyGrid';

const items: GridItem[] = [{ id: 'a', name: '광단말 A', col: 0, row: 0, colSpan: 1, rowSpan: 2 }];

/* jsdom 에는 레이아웃이 없다 — 판이 제 크기를 재는 길(`ResizeObserver`)에 크기를 물려 준다.
   판은 상자에 맞춰 칸 크기를 셈하므로, 크기가 0이면 어느 칸인지도 셈할 수 없다. */
beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    constructor(private cb: (entries: { contentRect: { width: number; height: number } }[]) => void) {}
    observe() {
      this.cb([{ contentRect: { width: 100, height: 200 } }]);
    }
    unobserve() {}
    disconnect() {}
  };
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
  return { onSelect, onAddAtCell, onMove };
}

const emptyCell = () => screen.getAllByRole('button', { name: /비어 있음/ })[0]!;
const item = () => screen.getByRole('button', { name: /광단말 A,/ });

describe('AssemblyGrid', () => {
  /* 빈 칸은 **놓을 자리**다 — 고른 것이 있어도 누르면 곧바로 채운다(먼저 풀고 다시 누르게
     하면 옆 칸에 하나 더 넣으려던 손짓이 매번 삼켜진다). */
  /* 빈 칸은 **놓을 자리**다 — 고른 것이 있어도 누르면 곧바로 채운다. 끌면 그만큼 크게 만든다
     (한 칸씩 만들어 손잡이로 늘리는 것은 같은 일을 두 번 하는 것이다). */
  it('빈 칸을 누르면 그 자리에 만든다', () => {
    const { onAddAtCell } = setup({ selectedId: 'a' });
    const layer = emptyCell().parentElement!;
    /* 칸 셈은 **감싼 상자**의 크기를 그 자리에서 잰다 — jsdom 에는 레이아웃이 없어 물려 준다. */
    layer.parentElement!.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 100, height: 200 }) as DOMRect;
    fireEvent(layer, new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 70, clientY: 160 }));
    fireEvent(window, new MouseEvent('pointerup', { bubbles: true, cancelable: true, button: 0, clientX: 70, clientY: 160 }));
    expect(onAddAtCell).toHaveBeenCalledWith(expect.objectContaining({ colSpan: 1, rowSpan: 1 }));
  });

  it('빈 칸을 여러 개 끌면 그 크기로 만든다', () => {
    const { onAddAtCell } = setup({ items: [] });
    const layer = emptyCell().parentElement!;
    /* 칸 셈은 **감싼 상자**의 크기를 그 자리에서 잰다 — jsdom 에는 레이아웃이 없어 물려 준다. */
    layer.parentElement!.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 100, height: 200 }) as DOMRect;
    fireEvent(layer, new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 10, clientY: 10 }));
    fireEvent(window, new MouseEvent('pointermove', { bubbles: true, cancelable: true, clientX: 70, clientY: 60 }));
    fireEvent(window, new MouseEvent('pointerup', { bubbles: true, cancelable: true, button: 0, clientX: 70, clientY: 60 }));
    const at = onAddAtCell.mock.calls[0]![0];
    expect(at.colSpan).toBeGreaterThan(1);
    expect(at.rowSpan).toBeGreaterThan(1);
  });

  /* 「누른 것인가 끈 것인가」는 **손짓의 끝**에서 한 번만 갈린다(자리가 그대로면 누른 것).
     그 판정은 라이브러리의 끌기 위에 서 있어 레이아웃이 없는 jsdom 에서는 돌릴 수 없다 —
     브라우저에서 잰다. 여기서는 우리가 쥔 길(키보드)만 잠근다. */
  it('키보드(Enter)로도 고른다 — 손짓과 다른 길이다', () => {
    const { onSelect } = setup();
    fireEvent.keyDown(item(), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  /* 빼기 단추는 손이 얹혀야 나타난다 — 키보드에는 그 길이 없으므로 Delete 로도 뺀다. */
  it('Delete 로 뺀다', () => {
    const onRemove = vi.fn();
    setup({ onRemove });
    fireEvent.keyDown(item(), { key: 'Delete' });
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('빼기 단추로도 뺀다 — 그때 고르기가 함께 일어나지 않는다', () => {
    const onRemove = vi.fn();
    const { onSelect } = setup({ onRemove });
    fireEvent.click(screen.getByRole('button', { name: '광단말 A 빼기' }));
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('뺄 길을 주지 않으면 빼기 단추가 없다 — 읽기 전용 판', () => {
    setup();
    expect(screen.queryByRole('button', { name: /빼기/ })).not.toBeInTheDocument();
  });

  /* 한 번의 Esc 는 한 층만 물린다 — 안 그러면 바깥 층까지 함께 반응해 편집 화면이 닫힌다. */
  it('Esc 를 누르면 푼다', () => {
    const onDeselect = vi.fn();
    setup({ selectedId: 'a', onDeselect });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onDeselect).toHaveBeenCalledTimes(1);
  });

  it('고른 것이 없으면 Esc 는 아무 일도 하지 않는다', () => {
    const onDeselect = vi.fn();
    setup({ onDeselect });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onDeselect).not.toHaveBeenCalled();
  });

  /* 「몇 단인가」는 눈금이 말한다 — 칸마다 번호를 박으면 판이 번호로 뒤덮인다. */
  it('단 눈금이 행 수만큼 선다', () => {
    setup();
    expect(screen.getByRole('list', { hidden: true }).children).toHaveLength(4);
  });
});
