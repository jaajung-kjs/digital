import { describe, expect, it } from 'vitest';
import { cellAt, edgeScroll, gridDragTo, gridPlacementChanged, scrollableAncestor, startGridDrag } from '../gridDrag';

const box = { width: 200, height: 120, cols: 2, rows: 6 }; // 칸 = 100 × 20

describe('cellAt', () => {
  it('상대 좌표를 칸으로 나눈다', () => {
    expect(cellAt(box, 10, 10)).toEqual({ col: 0, row: 0 });
    expect(cellAt(box, 150, 10)).toEqual({ col: 1, row: 0 });
    expect(cellAt(box, 10, 50)).toEqual({ col: 0, row: 2 });
    expect(cellAt(box, 199, 119)).toEqual({ col: 1, row: 5 });
  });

  /* 드래그 중 손이 살짝 벗어났다고 자리가 튀면 놓을 곳을 겨눌 수가 없다. */
  it('격자 밖은 가장자리 칸으로 붙인다', () => {
    expect(cellAt(box, -50, -50)).toEqual({ col: 0, row: 0 });
    expect(cellAt(box, 9999, 9999)).toEqual({ col: 1, row: 5 });
  });

  it('크기가 0이어도 터지지 않는다 — 아직 그려지기 전의 상자', () => {
    expect(cellAt({ width: 0, height: 0, cols: 0, rows: 0 }, 5, 5)).toEqual({ col: 0, row: 0 });
  });
});

describe('gridDragTo — 이동', () => {
  const origin = { col: 0, row: 1, colSpan: 1, rowSpan: 2 };

  /* 타일 가운데를 잡았으면 가운데가 따라와야 한다 — 왼쪽 위 모서리로 튀면 손에서 어긋난다. */
  it('잡은 지점과의 거리를 유지한다', () => {
    const s = startGridDrag('move', 'a', origin, { col: 0, row: 2 }); // 두 번째 칸을 잡음
    expect(gridDragTo(s, { col: 1, row: 4 })).toEqual({ col: 1, row: 3, colSpan: 1, rowSpan: 2 });
  });

  it('왼쪽 위를 잡으면 그대로 따라온다', () => {
    const s = startGridDrag('move', 'a', origin, { col: 0, row: 1 });
    expect(gridDragTo(s, { col: 1, row: 0 })).toEqual({ col: 1, row: 0, colSpan: 1, rowSpan: 2 });
  });

  it('크기는 이동으로 바뀌지 않는다', () => {
    const s = startGridDrag('move', 'a', origin, { col: 0, row: 1 });
    expect(gridDragTo(s, { col: 1, row: 4 }).rowSpan).toBe(2);
  });
});

describe('gridDragTo — 크기', () => {
  const origin = { col: 0, row: 1, colSpan: 1, rowSpan: 1 };

  /* 왼쪽 위 모서리를 고정하고 오른쪽 아래를 끈다 — 평면도 핸들의 반대변 고정과 같다. */
  it('왼쪽 위를 고정하고 오른쪽 아래를 끈다', () => {
    const s = startGridDrag('resize', 'a', origin, { col: 0, row: 1 });
    expect(gridDragTo(s, { col: 1, row: 3 })).toEqual({ col: 0, row: 1, colSpan: 2, rowSpan: 3 });
  });

  it('위로 끌어도 최소 1칸 — 뒤집히지 않는다', () => {
    const s = startGridDrag('resize', 'a', origin, { col: 0, row: 1 });
    expect(gridDragTo(s, { col: 0, row: 0 })).toEqual({ col: 0, row: 1, colSpan: 1, rowSpan: 1 });
  });
});

describe('gridPlacementChanged', () => {
  it('같은 자리에 놓으면 바뀐 것이 없다', () => {
    const p = { col: 1, row: 2, colSpan: 1, rowSpan: 1 };
    expect(gridPlacementChanged(p, { ...p })).toBe(false);
    expect(gridPlacementChanged(p, { ...p, row: 3 })).toBe(true);
    expect(gridPlacementChanged(p, { ...p, rowSpan: 2 })).toBe(true);
  });
});

describe('edgeScroll', () => {
  const view = { left: 0, top: 0, right: 200, bottom: 400 };
  const opts = { margin: 20, maxSpeed: 10 };

  it('가운데에서는 밀지 않는다', () => {
    expect(edgeScroll(view, { x: 100, y: 200 }, opts)).toEqual({ dx: 0, dy: 0 });
  });

  /* 깊이 들어갈수록 빨라야 한다 — 한 칸 넘길 때와 끝까지 갈 때가 같은 속도면 답답하다. */
  it('가장자리에 깊이 들어갈수록 빨라진다', () => {
    const shallow = edgeScroll(view, { x: 100, y: 390 }, opts).dy;
    const deep = edgeScroll(view, { x: 100, y: 398 }, opts).dy;
    expect(shallow).toBeGreaterThan(0);
    expect(deep).toBeGreaterThan(shallow);
  });

  it('위·왼쪽은 음수로 민다', () => {
    expect(edgeScroll(view, { x: 2, y: 2 }, opts)).toEqual({ dx: -9, dy: -9 });
  });

  /* 손이 창 밖으로 나가도 폭주하면 안 된다. */
  it('밖으로 나가도 최대 속도로 묶는다', () => {
    expect(edgeScroll(view, { x: 100, y: 9999 }, opts).dy).toBe(10);
    expect(edgeScroll(view, { x: -9999, y: 200 }, opts).dx).toBe(-10);
  });
});

/* jsdom 에는 레이아웃이 없어 scrollHeight/clientWidth 가 전부 0 이다 — 굴러갈 여유를 지어 준다. */
function scrollBox(overflow: Partial<CSSStyleDeclaration>, room: { x?: number; y?: number } = {}) {
  const el = document.createElement('div');
  Object.assign(el.style, overflow);
  Object.defineProperty(el, 'scrollHeight', { value: room.y ?? 0 });
  Object.defineProperty(el, 'clientHeight', { value: 0 });
  Object.defineProperty(el, 'scrollWidth', { value: room.x ?? 0 });
  Object.defineProperty(el, 'clientWidth', { value: 0 });
  return el;
}

describe('scrollableAncestor', () => {
  it('그 축으로 굴러가는 가장 가까운 조상을 찾는다', () => {
    const outer = scrollBox({ overflowY: 'auto' }, { y: 500 });
    const inner = document.createElement('div');
    outer.append(inner);
    expect(scrollableAncestor(inner, 'y')).toBe(outer);
  });

  /* `overflow-x: auto` 만 걸어도 CSS 는 세로를 `auto` 로 계산한다 — 굴러갈 여유가 없으면
     세로 상자로 오인하면 안 된다(격자 자신의 가로 상자가 그렇다). */
  it('굴러갈 여유가 없으면 그 상자가 아니다', () => {
    const hOnly = scrollBox({ overflowX: 'auto' }, { x: 500 });
    const outer = scrollBox({ overflowY: 'auto' }, { y: 500 });
    const inner = document.createElement('div');
    hOnly.append(inner);
    outer.append(hOnly);
    expect(scrollableAncestor(inner, 'y')).toBe(outer);
    expect(scrollableAncestor(inner, 'x')).toBe(hOnly);
  });

  it('굴러가는 조상이 없으면 null', () => {
    const el = document.createElement('div');
    expect(scrollableAncestor(el, 'y')).toBeNull();
  });
});
