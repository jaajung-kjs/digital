import { describe, expect, it } from 'vitest';
import { freeCells, validateGridPlacement } from './gridPlacement.js';

const grid = { cols: 1, rows: 12 };
const base = { grid, col: 0, row: 0, colSpan: 1, rowSpan: 1, occupants: [] };

describe('validateGridPlacement', () => {
  it('격자 안이고 안 겹치면 null', () => {
    expect(validateGridPlacement(base)).toBeNull();
  });

  it('span 0 → out-of-range', () => {
    expect(validateGridPlacement({ ...base, rowSpan: 0 })).toBe('out-of-range');
    expect(validateGridPlacement({ ...base, colSpan: 0 })).toBe('out-of-range');
  });

  it('격자 밖 → out-of-range', () => {
    expect(validateGridPlacement({ ...base, row: 12 })).toBe('out-of-range');
    expect(validateGridPlacement({ ...base, row: -1 })).toBe('out-of-range');
    expect(validateGridPlacement({ ...base, row: 11, rowSpan: 2 })).toBe('out-of-range');
    // 1열짜리 격자에 두 번째 열은 없다.
    expect(validateGridPlacement({ ...base, col: 1 })).toBe('out-of-range');
  });

  it('자리가 없으면 out-of-range', () => {
    expect(validateGridPlacement({ ...base, col: null })).toBe('out-of-range');
    expect(validateGridPlacement({ ...base, row: null })).toBe('out-of-range');
  });

  it('기존 점유와 겹치면 overlap', () => {
    const occ = [{ assetId: 'other', col: 0, row: 1, colSpan: 1, rowSpan: 2 }];
    expect(validateGridPlacement({ ...base, row: 2, occupants: occ })).toBe('overlap');
    expect(validateGridPlacement({ ...base, row: 3, occupants: occ })).toBeNull();
  });

  /* 가로·세로 **둘 다** 겹쳐야 겹친 것이다 — 1차원 모델을 그대로 옮기면 같은 행의 옆 칸이
     겹친 것으로 잘못 판정된다. */
  it('같은 행이라도 열이 다르면 겹치지 않는다', () => {
    const two = { ...base, grid: { cols: 2, rows: 6 } };
    const occ = [{ assetId: 'other', col: 0, row: 1, colSpan: 1, rowSpan: 1 }];
    expect(validateGridPlacement({ ...two, col: 1, row: 1, occupants: occ })).toBeNull();
    expect(validateGridPlacement({ ...two, col: 0, row: 1, occupants: occ })).toBe('overlap');
  });
});

describe('freeCells', () => {
  const cell = (col: number, row: number) => ({ col, row });

  it('점유(span 포함) 제외한 빈 칸', () => {
    expect(
      freeCells({ cols: 1, rows: 6 }, [
        { col: 0, row: 0, colSpan: 1, rowSpan: 2 },
        { col: 0, row: 4, colSpan: 1, rowSpan: 1 },
      ]),
    ).toEqual([cell(0, 2), cell(0, 3), cell(0, 5)]);
  });

  it('span null(=1)인 점유자도 1칸만 차지', () => {
    expect(freeCells({ cols: 1, rows: 4 }, [{ col: 0, row: 1, colSpan: null, rowSpan: null }]))
      .toEqual([cell(0, 0), cell(0, 2), cell(0, 3)]);
  });

  it('자리 없는 점유자는 무시', () => {
    expect(freeCells({ cols: 1, rows: 3 }, [{ col: null, row: null, colSpan: 2, rowSpan: 2 }]))
      .toEqual([cell(0, 0), cell(0, 1), cell(0, 2)]);
  });

  /* 행 우선으로 훑는다 — 자리 번호와 같은 순서라야 고르는 목록이 1·2·3… 으로 읽힌다. */
  it('여러 열이면 행 우선으로 훑는다', () => {
    expect(freeCells({ cols: 2, rows: 2 }, [])).toEqual([cell(0, 0), cell(1, 0), cell(0, 1), cell(1, 1)]);
  });
});
