import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { GridLayout, noCompactor, type LayoutItem } from 'react-grid-layout';
import { type Grid, cellLabel } from '@twin/core';
import { cn, type BadgeStatus, isCancelKey, InsetBox } from '../../components/ui';
import type { GridCell, GridPlacement } from '../gridDrag';

/**
 * 설비 격자 — **끌기·크기·겹침은 `react-grid-layout` 이 맡는다.**
 *
 * 손으로 짠 포인터 코드를 오래 고쳤지만 계속 졌다: 캡처가 언제 풀리는지, 손이 창을 벗어나면
 * 어떻게 되는지, 칸 사이 틈을 누르면 어디로 치는지, 끝을 알리는 신호가 뗌보다 먼저 오는지 —
 * 전부 브라우저·프레임워크마다 다르고 하나를 맞추면 다른 하나가 어긋났다. 그 일은 십 년 넘게
 * 검증된 라이브러리가 이미 풀어 놓았다.
 *
 * 여기 남는 것은 **우리 규칙**뿐이다: 단 눈금, 빈 칸을 눌러 만들기, 빼기, 이름·요약, 상태 불.
 */
export interface GridItem {
  id: string;
  name: string;
  col: number | null;
  row: number | null;
  colSpan: number | null;
  rowSpan: number | null;
}

export interface AssemblyGridProps<T extends GridItem> {
  grid: Grid;
  items: readonly T[];
  onSelect: (item: T) => void;
  /** 빈 자리를 눌렀다 — 그 칸에 만든다. */
  onAddAtCell: (at: GridCell & { colSpan?: number; rowSpan?: number }) => void;
  /** 자리를 옮기거나 크기를 바꿨다 — 놓을 수 있는 것만 온다. */
  onMove: (itemId: string, placement: GridPlacement) => void;
  /** 이 자리에 놓을 수 있는가. */
  canPlace: (itemId: string, placement: GridPlacement) => boolean;
  trailing?: (item: T) => ReactNode;
  selectedId?: string | null;
  boxHeight?: number;
  fill?: boolean;
  onDeselect?: () => void;
  /** 무엇을 넣을지 정하는 중인 자리 — 그동안 그 네모가 판에 남는다. */
  pending?: { at: GridPlacement; label: string } | null;
  onRemove?: (item: T) => void;
  toneOf?: (item: T) => BadgeStatus | null;
}

export const GRID_ROW_H = 30;
const GAP = 2;

const LAMP: Record<BadgeStatus, string> = {
  success: 'bg-lamp-success',
  warning: 'bg-lamp-warning',
  danger: 'bg-lamp-danger',
  info: 'bg-info',
  neutral: 'bg-content-faint',
};

const place = (i: GridItem): GridPlacement => ({
  col: i.col ?? 0, row: i.row ?? 0, colSpan: i.colSpan ?? 1, rowSpan: i.rowSpan ?? 1,
});

export function AssemblyGrid<T extends GridItem>({
  grid, items, onSelect, onAddAtCell, onMove, canPlace, trailing, selectedId,
  boxHeight, fill, onDeselect, onRemove, pending, toneOf,
}: AssemblyGridProps<T>) {
  const rows = Math.max(grid.rows, 1);
  const cols = Math.max(grid.cols, 1);
  /**
   * 판이 앉을 자리 — **판은 상자에 맞춘다. 스크롤을 만들지 않는다.**
   *
   * 랙 정면도는 한눈에 들어와야 하는 그림이다. 좌우로 밀거나 아래로 내려야 전부 보이면
   * 「어디에 무엇이 있나」를 그 순간 잃는다. 그래서 칸 크기를 못 박지 않고 **남는 자리를
   * 행·열 수로 나눈다** — 20행이든 4행이든 같은 상자를 채운다.
   */
  const [box, setBox] = useState({ w: 0, h: 0 });
  const boxRef = useRef<HTMLDivElement | null>(null);
  /* 상자가 커지고 줄 때마다 다시 잰다 — 패널 폭은 화면 크기·상세 열림에 따라 바뀐다. */
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect;
      setBox((cur) => (cur.w === width && cur.h === height ? cur : { w: width, h: height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Esc 로 푼다 — **한 층만** 물린다(안 그러면 바깥 층까지 함께 반응해 편집 화면이 닫힌다). */
  const deselectRef = useRef(onDeselect);
  deselectRef.current = onDeselect;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isCancelKey(e) || selectedId == null) return;
      e.stopPropagation();
      deselectRef.current?.();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [selectedId]);

  const rowH = box.h > 0 ? Math.max((box.h - (rows - 1) * GAP) / rows, 1) : GRID_ROW_H;
  const width = box.w;

  const layout: LayoutItem[] = items
    .filter((i) => i.col != null && i.row != null)
    .map((i) => {
      const at = place(i);
      return { i: i.id, x: at.col, y: at.row, w: at.colSpan, h: at.rowSpan };
    });

  const byId = new Map(items.map((i) => [i.id, i]));
  /** 어느 칸이 차 있는가 — 빈 칸을 그리기 위해. */
  const taken = new Set<string>();
  for (const l of layout)
    for (let r = 0; r < l.h; r++) for (let c = 0; c < l.w; c++) taken.add(`${l.x + c},${l.y + r}`);

  /** 라이브러리가 준 새 자리 — 우리 규칙에 맞을 때만 받는다. */
  const commit = (l: LayoutItem) => {
    const at: GridPlacement = { col: l.x, row: l.y, colSpan: l.w, rowSpan: l.h };
    const cur = byId.get(l.i);
    if (!cur) return;
    const was = place(cur);
    if (at.col === was.col && at.row === was.row && at.colSpan === was.colSpan && at.rowSpan === was.rowSpan) return;
    if (!canPlace(l.i, at)) return;
    onMove(l.i, at);
  };

  return (
    <InsetBox
      /* 넘치는 것을 잘라 낸다 — 판이 상자에 맞으므로 넘칠 것이 없다(잘리면 셈이 틀린 것이다). */
      className={cn('mt-1 flex gap-1 overflow-hidden p-1.5 shadow-inner', fill && 'min-h-0 flex-1')}
      style={boxHeight != null ? { height: boxHeight } : undefined}
      onPointerDown={(e) => { if (e.target === e.currentTarget && selectedId != null) onDeselect?.(); }}
    >
      {/* 단 눈금 — 「몇 단인가」를 판 옆에서 읽는다. */}
      <ol
        aria-hidden
        className="grid shrink-0 gap-0.5 text-right text-xs tabular-nums text-content-faint"
        style={{ gridTemplateRows: `repeat(${rows}, ${rowH}px)`, rowGap: GAP }}
      >
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="flex items-center justify-end pr-0.5 leading-none">{i + 1}</li>
        ))}
      </ol>

      {/* 판은 **행 수만큼** 자리를 갖는다 — 내용 높이에 맡기면 마지막 장비 아래로는 끌 수가
          없다(놓인 것이 하나뿐이면 판도 그만큼만 높다). */}
      <div
        className="relative min-h-0 min-w-0 flex-1"
        ref={boxRef}
      >
        {/* 빈 칸 — 누르면 그 자리에 만든다. 판 밑에 깔려 있고, 위에 놓인 것은 라이브러리가 그린다. */}
        <div
          className="absolute inset-0 grid"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, ${rowH}px)`,
            gap: GAP,
          }}
        >
          {Array.from({ length: rows * cols }, (_, n) => {
            const col = n % cols;
            const row = Math.floor(n / cols);
            if (taken.has(`${col},${row}`)) return <span key={n} />;
            const isPending =
              pending != null &&
              col >= pending.at.col && col < pending.at.col + pending.at.colSpan &&
              row >= pending.at.row && row < pending.at.row + pending.at.rowSpan;
            return (
              <button
                key={n}
                type="button"
                data-cell={`${col},${row}`}
                aria-label={`${cellLabel(col, row)}, 비어 있음. 눌러서 추가`}
                title={`${cellLabel(col, row)} (비어 있음)`}
                className={cn(
                  'group flex items-center justify-center rounded border border-dashed border-line/50 text-content-faint transition-colors',
                  'hover:border-solid hover:border-primary hover:bg-info-bg hover:text-primary',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                  isPending && 'border-2 border-solid border-primary bg-info-bg',
                )}
                onClick={() => onAddAtCell({ col, row })}
              >
                <span className="text-base leading-none text-primary opacity-0 transition-opacity group-hover:opacity-100">+</span>
              </button>
            );
          })}
        </div>

        {/* 놓인 것 — 끌기·크기·겹침은 전부 라이브러리가 맡는다. */}
        <GridLayout
          /* 이 판은 빈 칸 위에 겹쳐 있다 — **판 자신은 손짓을 통과시키고** 놓인 타일만 받는다.
             안 그러면 빈 곳을 눌러도 이 판이 먹어 호버도 클릭도 없다. */
          className="pointer-events-none absolute inset-0"
          autoSize={false}
          layout={layout}
          width={width}
          /* 판의 치수 — 눈금·빈 칸과 **같은 수**를 쓴다(어긋나면 놓인 것이 칸에서 밀린다). */
          gridConfig={{ cols, rowHeight: rowH, margin: [GAP, GAP], containerPadding: [0, 0], maxRows: rows }}
          /* 자리는 사람이 정한다 — 밀어내거나 위로 당기지 않는다. */
          compactor={noCompactor}
          dragConfig={{ enabled: true, bounded: true, cancel: '[data-remove]' }}
          resizeConfig={{ enabled: true, handles: ['se'] }}
          onDragStop={(_l, _o, n) => n && commit(n)}
          onResizeStop={(_l, _o, n) => n && commit(n)}
        >
          {layout.map((l) => {
            const item = byId.get(l.i)!;
            const tone = toneOf?.(item) ?? null;
            return (
              <div
                key={l.i}
                className={cn(
                  'pointer-events-auto group relative flex cursor-grab select-none items-center justify-center overflow-hidden rounded border border-line bg-surface px-1 text-center text-xs text-content active:cursor-grabbing',
                  selectedId === item.id && 'ring-2 ring-inset ring-primary',
                )}
                role="button"
                tabIndex={0}
                aria-label={`${item.name}, ${cellLabel(l.x, l.y)}`}
                title={`${item.name} · ${cellLabel(l.x, l.y)}`}
                onClick={() => onSelect(item)}
                onKeyDown={(e) => {
                  if ((e.key === 'Delete' || e.key === 'Backspace') && onRemove) { e.preventDefault(); onRemove(item); return; }
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  onSelect(item);
                }}
              >
                <span className="flex min-w-0 max-w-full flex-col items-center leading-tight">
                  <span className="min-w-0 max-w-full truncate">{item.name}</span>
                  {l.h > 1 && trailing?.(item)}
                </span>
                {tone && (
                  <span aria-hidden className={cn('pointer-events-none absolute left-1 top-1 h-2 w-2 rounded-full ring-1 ring-content-faint/60', LAMP[tone])} />
                )}
                {onRemove && (
                  <span
                    role="button"
                    tabIndex={-1}
                    data-remove
                    aria-label={`${item.name} 빼기`}
                    title="구성에서 빼기"
                    className={cn(
                      'absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded transition-opacity',
                      'text-content-faint hover:bg-danger-bg hover:text-danger',
                      selectedId === item.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                    )}
                    onClick={(e) => { e.stopPropagation(); onRemove(item); }}
                  >
                    <X size={12} />
                  </span>
                )}
              </div>
            );
          })}
        </GridLayout>
      </div>
    </InsetBox>
  );
}
