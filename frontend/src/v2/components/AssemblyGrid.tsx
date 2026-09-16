import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { GridLayout, noCompactor, type LayoutItem } from 'react-grid-layout';
import { type Grid, type GridCell, type GridPlacement, cellLabel } from '@twin/core';
import { cn, type BadgeStatus, isCancelKey, InsetBox } from '../../components/ui';

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
  onRemove?: (item: T) => void;
  toneOf?: (item: T) => BadgeStatus | null;
  /**
   * 이 칸이 **아직 비어 있는 자리**인가 — 자리와 이름만 정해졌고 아무것도 안 꽂혔다.
   *
   * 실물 랙은 「구성은 같고 실장만 다르다」: 8410P 는 서비스 슬롯이 열인데 두 장만 꽂혀 있다.
   * 그 자리를 점선으로 그려 두면 **크기와 이름이 이미 정해져 있다**는 것이 눈에 보이고,
   * 눌러서 꽂을 때 무엇을 어디에 넣는지 다시 정할 일이 없다.
   */
  ghostOf?: (item: T) => boolean;
}

export const GRID_ROW_H = 30;
/** 열 눈금 줄의 높이 — 판의 칸 높이와 무관한 고정값(숫자 한 줄). */
const RULER_H = 12;
const GAP = 2;
/** 이 폭보다 좁으면 가로로 적을 자리가 없다 — 그때는 글씨를 세운다. */
const LABEL_MIN_W = 56;
/**
 * 이만큼까지는 **누른 것**이다 — 손은 누를 때도 조금 흔들린다(브라우저의 클릭 판정도 이 폭이다).
 */
const PRESS_SLOP = 4;

/** 손이 있던 자리 — 마우스든 손가락이든 한 점으로 읽는다. */
function pointOf(e: Event): { x: number; y: number } | null {
  const t = 'changedTouches' in e ? (e as TouchEvent).changedTouches[0] : (e as MouseEvent);
  return t && 'clientX' in t ? { x: t.clientX, y: t.clientY } : null;
}

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
  boxHeight, fill, onDeselect, onRemove, toneOf, ghostOf,
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
      if (!isCancelKey(e)) return;
      if (selectedId == null) return;
      e.stopPropagation();
      deselectRef.current?.();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [selectedId]);

  const rowH = box.h > 0 ? Math.max((box.h - (rows - 1) * GAP) / rows, 1) : GRID_ROW_H;
  const width = box.w;
  const colW = width > 0 ? (width - (cols - 1) * GAP) / cols : 0;

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

  /**
   * 빈 자리를 **끌어서** 만든다 — 한 칸이면 그냥 누른 것이다.
   *
   * 이것만 우리 손짓이다(옮기기·크기는 라이브러리의 것). 두 가지만 지킨다:
   * - **칸은 좌표가 정한다.** 눌린 요소를 거슬러 올라가면 칸 사이 틈과 둥근 모서리에서
   *   시작조차 안 된다 — 그 자리가 판 전체에 격자무늬로 깔려 있다.
   * - **손짓 동안은 창이 듣는다.** 포인터 캡처를 쓰면 언제 풀리는지, 그 풀림이 뗌보다 먼저
   *   오는지를 브라우저·프레임워크마다 따로 맞춰야 한다.
   */
  const [draw, setDraw] = useState<GridPlacement | null>(null);

  /** 끌기를 시작한 자리 — 끝에서 「손이 움직였나」를 이것과 견준다. */
  const pressRef = useRef<{ x: number; y: number } | null>(null);

  /**
   * 이 좌표는 어느 칸인가 — **판의 지금 크기를 그 자리에서 잰다.**
   *
   * 재 둔 값(상태)을 쓰면 손짓이 시작된 렌더의 크기에 묶인다. 그 값이 아직 안 왔거나 그사이
   * 판이 달라졌으면 칸이 통째로 어긋난다(2칸을 끌었는데 8칸이 잡혔다). 크기는 여기서 묻는다.
   *
   * 칸 사이 **틈을 셈에 넣는다** — 폭을 열 수로 그냥 나누면 오른쪽으로 갈수록 한 칸씩 밀린다.
   */
  const cellAtPoint = (e: { clientX: number; clientY: number }): GridCell | null => {
    const el = boxRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    const cw = (r.width - (cols - 1) * GAP) / cols;
    const ch = (r.height - (rows - 1) * GAP) / rows;
    const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);
    return {
      col: clamp(Math.floor((e.clientX - r.left) / (cw + GAP)), cols - 1),
      row: clamp(Math.floor((e.clientY - r.top) / (ch + GAP)), rows - 1),
    };
  };

  const rectFree = (p: GridPlacement) => {
    for (let r = 0; r < p.rowSpan; r++)
      for (let c = 0; c < p.colSpan; c++) if (taken.has(`${p.col + c},${p.row + r}`)) return false;
    return true;
  };

  function startDraw(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const from = cellAtPoint(e);
    if (!from) return;
    e.preventDefault();
    let aim: GridPlacement = { col: from.col, row: from.row, colSpan: 1, rowSpan: 1 };
    setDraw(aim);

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const to = cellAtPoint(ev);
      if (!to) return;
      const next: GridPlacement = {
        col: Math.min(from.col, to.col), row: Math.min(from.row, to.row),
        colSpan: Math.abs(to.col - from.col) + 1, rowSpan: Math.abs(to.row - from.row) + 1,
      };
      /* **네모는 빈 자리에서만 자란다** — 막히면 그 앞에서 멈춘다. 남의 자리까지 덮게 두면
         손을 뗄 때 아무 일도 못 하고, 사람 눈에는 「끌었는데 반응 없이 사라졌다」가 된다. */
      if (!rectFree(next)) return;
      aim = next;
      setDraw(next);
    };
    const stop = (commit: boolean) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      setDraw(null);
      if (commit) onAddAtCell(aim);
    };
    const up = (ev: PointerEvent) => { if (ev.pointerId === e.pointerId) stop(true); };
    const cancel = (ev: PointerEvent) => { if (ev.pointerId === e.pointerId) stop(false); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  }

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
      {/* 눈금 — 「몇 열 몇 단인가」를 판 가장자리에서 읽는다. 실물 섀시에도 슬롯마다 번호가
          인쇄돼 있어서, 현장에서 「4번 슬롯」이라고 부르는 것과 화면이 같은 말을 한다. */}
      <ol
        aria-hidden
        className="grid shrink-0 gap-0.5 text-right text-xs tabular-nums text-content-faint"
        style={{ gridTemplateRows: `repeat(${rows}, ${rowH}px)`, rowGap: GAP, marginTop: RULER_H + GAP }}
      >
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="flex items-center justify-end pr-0.5 leading-none">{i + 1}</li>
        ))}
      </ol>

      {/* 판은 **행 수만큼** 자리를 갖는다 — 내용 높이에 맡기면 마지막 장비 아래로는 끌 수가
          없다(놓인 것이 하나뿐이면 판도 그만큼만 높다). */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* 열 눈금 — 판과 **같은 격자**로 그려야 칸과 번호가 어긋나지 않는다. */}
      <ol
        aria-hidden
        className="grid shrink-0 text-center text-xs tabular-nums leading-none text-content-faint"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, columnGap: GAP, height: RULER_H }}
      >
        {Array.from({ length: cols }, (_, i) => (
          <li key={i} className="truncate">{i + 1}</li>
        ))}
      </ol>
      <div
        className="relative min-h-0 min-w-0 flex-1"
        ref={boxRef}
      >
        {/* 빈 칸 — 누르면 그 자리에 만든다. 판 밑에 깔려 있고, 위에 놓인 것은 라이브러리가 그린다. */}
        <div
          className="absolute inset-0 grid"
          onPointerDown={startDraw}
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, ${rowH}px)`,
            gap: GAP,
          }}
        >
          {Array.from({ length: rows * cols }, (_, n) => {
            const col = n % cols;
            const row = Math.floor(n / cols);
            if (taken.has(`${col},${row}`)) return null;
            /* 끄는 **동안**에는 칸마다 물든다 — 어느 칸까지 잡혔는지가 그때의 관심이다. */
            const isPending =
              draw != null &&
              col >= draw.col && col < draw.col + draw.colSpan &&
              row >= draw.row && row < draw.row + draw.rowSpan;
            return (
              <button
                key={n}
                type="button"
                /* **자리를 못 박는다.** 자동 배치로 두면 그 앞에 자리를 못 박은 것이 하나만
                   끼어도(무엇을 넣을지 묻는 네모가 그렇다) 뒤의 칸이 전부 한 칸씩 밀린다 —
                   손을 떼는 순간 판 곳곳에서 호버가 번쩍인 것이 그것이다(커서 아래 칸이
                   바뀌므로 브라우저가 다른 칸에 호버를 칠한다). */
                style={{ gridColumn: col + 1, gridRow: row + 1 }}
                data-cell={`${col},${row}`}
                aria-label={`${cellLabel(col, row)}, 비어 있음. 눌러서 추가`}
                title={`${cellLabel(col, row)} (비어 있음)`}
                className={cn(
                  'group flex items-center justify-center rounded border border-dashed border-line/50 text-content-faint transition-colors',
                  'hover:border-solid hover:border-primary hover:bg-info-bg hover:text-primary',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                  isPending && 'border-2 border-solid border-primary bg-info-bg',
                )}
                /* 손짓은 층이 받는다 — 칸은 눌린 자리를 알릴 뿐이다(틈·모서리도 층의 것이다). */
                tabIndex={-1}
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
          /**
           * **자리는 사람이 정하고, 겹치면 못 놓는다.**
           *
           * 압축 없음(`noCompactor`) + 충돌 차단(`preventCollision`) — 이 판에 맞는 조합이다.
           * 압축만 끄면 끌던 것이 남의 자리로 들어갈 때 **그것을 밀어낸다**. 랙에서는 그럴 수
           * 없다: 이미 꽂힌 장비는 내가 옮기기 전에는 움직이지 않는다. 막히면 끌던 것이
           * 제자리로 돌아온다(대시보드 타일처럼 자리를 서로 양보하는 판과 다른 점이다).
           */
          compactor={{ ...noCompactor, preventCollision: true }}
          /**
           * **누른 것인지 끈 것인지는 손짓의 끝에서 한 번만 판정한다.**
           *
           * `onClick` 을 따로 두면 끌기가 끝난 뒤 브라우저가 얹는 `click` 까지 「눌렀다」로
           * 읽혀, 자리만 옮겼는데 상세 상자가 떴다. 그렇다고 그 한 번을 표로 걸러 내면 이번엔
           * 진짜 누름이 삼켜진다(표를 언제 내리는지가 또 규칙이 된다).
           *
           * 문턱을 0으로 두면 **누름도 끌기로 시작**하므로 끝이 늘 온다 — 판정은 거기서 한다.
           *
           * 가르는 것은 **손이 움직였는가**이지 자리가 달라졌는가가 아니다. 남의 자리로 끌면
           * 라이브러리가 제자리에 돌려놓는데(겹침 금지), 그것을 「그대로 = 누른 것」으로 읽으면
           * 막힌 끌기마다 상세 상자가 떴다 — 사람은 옮기려 한 것이지 누른 적이 없다.
           */
          dragConfig={{ enabled: true, bounded: true, cancel: '[data-remove]', threshold: 0 }}
          resizeConfig={{ enabled: true, handles: ['se'] }}
          onDragStart={(_l, _o, _n, _p, e) => { pressRef.current = pointOf(e); }}
          onDragStop={(_l, _o, n, _p, e) => {
            const from = pressRef.current;
            pressRef.current = null;
            const to = pointOf(e);
            const moved = !from || !to || Math.hypot(to.x - from.x, to.y - from.y) > PRESS_SLOP;
            if (!moved) {
              const item = n && byId.get(n.i);
              if (item) onSelect(item);
              return;
            }
            if (n) commit(n);
          }}
          onResizeStop={(_l, _o, n) => n && commit(n)}
        >
          {layout.map((l) => {
            const item = byId.get(l.i)!;
            const tone = toneOf?.(item) ?? null;
            /* 아직 안 꽂힌 자리 — 점선으로, 이름은 흐리게. 「여기 자리가 있다」만 말한다. */
            const ghost = ghostOf?.(item) ?? false;
            /* 좁고 세로로 긴 칸이면 **글씨를 세운다** — 랙 실물의 카드 라벨이 그렇게 읽힌다.
               가로로 적으면 「광단말…」처럼 잘려 아무 말도 못 한다. */
            const w = l.w * colW + (l.w - 1) * GAP;
            const h = l.h * rowH + (l.h - 1) * GAP;
            const vertical = colW > 0 && w < LABEL_MIN_W && h > w;
            return (
              <div
                key={l.i}
                className={cn(
                  'pointer-events-auto group relative flex cursor-grab select-none items-center justify-center overflow-hidden rounded border px-1 text-center text-xs active:cursor-grabbing',
                  ghost
                    ? 'border-dashed border-line bg-surface-sunken/40 text-content-faint'
                    : 'border-line bg-surface text-content',
                  selectedId === item.id && 'ring-2 ring-inset ring-primary',
                )}
                role="button"
                tabIndex={0}
                aria-label={`${item.name}, ${cellLabel(l.x, l.y)}`}
                title={`${item.name} · ${cellLabel(l.x, l.y)}`}
                onKeyDown={(e) => {
                  if ((e.key === 'Delete' || e.key === 'Backspace') && onRemove && !ghost) { e.preventDefault(); onRemove(item); return; }
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  onSelect(item);
                }}
              >
                {vertical ? (
                  /* **눕혀서 한 줄로.** 예전에는 글자를 세워 쌓았다(`vertical-rl` +
                     `upright`) — 그러면 `EXCU-A` 가 `E X C U - A` 여섯 줄이 되어 카드가
                     아니라 글자 목록으로 읽혔다. 실물 랙 카드의 라벨은 세로로 쌓지 않고
                     **90° 눕혀 인쇄**돼 있다. 돌린 글자의 길이는 칸의 **높이**가 정하므로
                     `maxWidth` 에 높이를 준다(회전 전 기준이라 폭이 곧 세로 길이다). */
                  <span
                    className="absolute left-1/2 top-1/2 truncate whitespace-nowrap leading-none"
                    /* **회전 전 상자의 폭이 곧 세로 길이**다 — 흐름 안에 두면 칸의 좁은
                       폭(50px)에 먼저 걸려 `EXCU…` 로 잘린다. 띄워 놓고 폭을 칸 높이로 준다. */
                    style={{ width: Math.max(h - 8, 0), transform: 'translate(-50%, -50%) rotate(-90deg)', textAlign: 'center' }}
                  >
                    {item.name}
                  </span>
                ) : (
                  <span className="flex min-h-0 min-w-0 max-h-full max-w-full flex-col items-center leading-tight">
                    <span className="min-h-0 min-w-0 max-h-full max-w-full truncate">{item.name}</span>
                    {l.h > 1 && trailing?.(item)}
                  </span>
                )}
                {tone && (
                  <span aria-hidden className={cn('pointer-events-none absolute left-1 top-1 h-2 w-2 rounded-full ring-1 ring-content-faint/60', LAMP[tone])} />
                )}
                {/* 빈 자리에는 **뺄 것이 없다** — 자리는 설비 품목의 것이라 여기서 못 지운다. */}
                {onRemove && !ghost && (
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
      </div>
    </InsetBox>
  );
}
