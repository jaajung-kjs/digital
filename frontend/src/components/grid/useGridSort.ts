import { useState } from 'react';

export type SortType = 'text' | 'date' | 'number' | 'status';
export type SortDir = 'asc' | 'desc';
export type GridSort = { col: string; dir: SortDir } | null;

/** 타입별 비교 — text=ko localeCompare, date=시간차, number=수치, status=문자. 빈값(null/'')은 방향 무관 항상 뒤로. */
export function compareBy(type: SortType, av: string | number | null, bv: string | number | null): number {
  const aEmpty = av == null || av === '';
  const bEmpty = bv == null || bv === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  if (type === 'number') return Number(av) - Number(bv);
  if (type === 'date') return new Date(av as string).getTime() - new Date(bv as string).getTime();
  if (type === 'text') return String(av).localeCompare(String(bv), 'ko');
  return String(av).localeCompare(String(bv));
}

/** stable 정렬(동값=원순서). 빈값은 방향 무관 항상 뒤로. */
export function sortRows<Row>(rows: Row[], accessor: (r: Row) => string | number | null, type: SortType, dir: SortDir): Row[] {
  const factor = dir === 'asc' ? 1 : -1;
  return rows
    .map((row, idx) => ({ row, idx }))
    .sort((a, b) => {
      const av = accessor(a.row);
      const bv = accessor(b.row);
      const aEmpty = av == null || av === '';
      const bEmpty = bv == null || bv === '';
      // 빈값은 방향 무관 항상 뒤로(factor 미적용).
      if (aEmpty && bEmpty) return a.idx - b.idx;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      const c = compareBy(type, av, bv);
      return c !== 0 ? c * factor : a.idx - b.idx;
    })
    .map((w) => w.row);
}

/** 3단계 정렬 상태(asc→desc→해제, 다른 col→asc). */
export function useGridSort() {
  const [sort, setSort] = useState<GridSort>(null);
  const cycleSort = (col: string) =>
    setSort((cur) => {
      if (!cur || cur.col !== col) return { col, dir: 'asc' };
      if (cur.dir === 'asc') return { col, dir: 'desc' };
      return null;
    });
  return { sort, cycleSort };
}
