import { describe, expect, it } from 'vitest';
import { cellAt, gridDragTo, gridPlacementChanged, startGridDrag } from '../gridDrag';

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
