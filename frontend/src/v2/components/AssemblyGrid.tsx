import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { type Grid, cellLabel } from '@twin/core';
import { cn, type BadgeStatus, isCancelKey, InsetBox } from '../../components/ui';
import { cellAt, type GridCell, type GridPlacement } from '../gridDrag';
import { inWindow } from '../canvas/drag';

/**
 * 격자에 놓이는 것 — **자산이든 설비 품목의 장비든** 이만큼만 있으면 그린다.
 *
 * 상세 패널은 실제 자산을, 설비 품목 편집기는 아직 자산이 아닌 장비를 놓는다. 둘은 같은 판을
 * 봐야 한다 — 설비 품목에서 짠 모습이 놓고 나면 달라 보이면 짜는 뜻이 없다.
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
  /** 빈 자리에 만든다 — 여러 칸을 끌었으면 그 크기까지 온다. */
  onAddAtCell: (at: GridCell & { colSpan?: number; rowSpan?: number }) => void;
  /** 자리를 옮기거나 크기를 바꿨을 때 — 놓을 수 있는 것만 온다. */
  onMove: (itemId: string, placement: GridPlacement) => void;
  /** 이 자리에 놓을 수 있는가 — 겹침·범위를 부르는 쪽이 판정한다. */
  canPlace: (itemId: string, placement: GridPlacement) => boolean;
  /** 이름 뒤에 붙는 것 — 자산이면 포트 요약, 설비 품목이면 품목 이름. */
  trailing?: (item: T) => ReactNode;
  selectedId?: string | null;
  /** 판이 앉을 상자의 높이(px). 주지 않으면 남는 자리를 다 쓴다(`fill`). */
  boxHeight?: number;
  fill?: boolean;
  onDeselect?: () => void;
  /** 무엇을 넣을지 정하는 중인 자리 — 그동안 그 네모가 판에 남는다. */
  pending?: { at: GridPlacement; label: string } | null;
  onRemove?: (item: T) => void;
  /** 운전 상태 불 — 색은 상태 어휘가 정한다. */
  toneOf?: (item: T) => BadgeStatus | null;
}

export const GRID_ROW_H = 30;
const GRID_COL_MIN = 44;

const LAMP: Record<BadgeStatus, string> = {
  success: 'bg-lamp-success',
  warning: 'bg-lamp-warning',
  danger: 'bg-lamp-danger',
  info: 'bg-info',
  neutral: 'bg-content-faint',
};

/**
 * 지금 벌어지는 손짓 — **값 하나가 전부다.**
 *
 * 한때 이 판은 한 손짓을 아홉 조각에 나눠 들고 있었고(무엇을 잡았나·미리보기·그리는 네모·
 * 끄는 중인가·마지막 손 자리·밀기 루프…) 그중 둘은 같은 값을 ref 와 state 에 이중으로 들었다.
 * 조각이 어긋날 때마다 새 증상이 났다 — 하나를 고치면 다음이 깨진 이유가 그것이다.
 *
 * - 겨눈 자리(`aim`)가 이 값 안에 있으므로 **그리는 것도 끝내는 것도 같은 것을 읽는다.**
 * - **포인터 하나의 것**이다. 끼어든 다른 포인터의 이벤트에 손짓이 취소되지 않는다.
 * - 시작도 끝도 **상자 하나가** 받는다. 칸·손잡이·빼기는 표(`data-*`)로만 자기를 알린다.
 */
interface Gesture {
  pointerId: number;
  /** 옮기거나(있는 것을 잡음) 크기를 바꾸거나(손잡이) 새로 그린다(빈 칸). */
  kind: 'move' | 'resize' | 'draw';
  /** 누른 칸 — 안 끌었으면 이 칸에 대해 행동하고, 그릴 때는 네모의 한쪽 끝이다. */
  from: GridCell;
  /** 잡은 것 — 그리는 중이면 없다. */
  itemId: string | null;
  /** 잡기 전 자리 — 옮기기·크기의 기준. */
  origin: GridPlacement | null;
  /** 지금 겨눈 자리. */
  aim: GridPlacement | null;
  /**
   * 손이 **다른 칸까지 갔는가** — 겨눈 자리가 따라갔는지와 별개다.
   *
   * 「끈 것은 누른 것이 아니다」는 손이 움직였느냐로 정해야 한다. 겨눈 자리로 판정하면,
   * 갈 수 있는 자리가 하나도 없어 미리보기가 제자리에 머문 경우에 끌기가 「누른 것」으로
   * 읽혀 상세가 열린다.
   */
  moved: boolean;
}

const place = (i: GridItem): GridPlacement => ({
  col: i.col ?? 0, row: i.row ?? 0, colSpan: i.colSpan ?? 1, rowSpan: i.rowSpan ?? 1,
});
const same = (a: GridPlacement, b: GridPlacement) =>
  a.col === b.col && a.row === b.row && a.colSpan === b.colSpan && a.rowSpan === b.rowSpan;
const overlaps = (a: GridPlacement, b: GridPlacement) =>
  a.col < b.col + b.colSpan && b.col < a.col + a.colSpan &&
  a.row < b.row + b.rowSpan && b.row < a.row + a.rowSpan;

export function AssemblyGrid<T extends GridItem>({
  grid, items, onSelect, onAddAtCell, onMove, canPlace, trailing, selectedId,
  boxHeight, fill, onDeselect, onRemove, pending, toneOf,
}: AssemblyGridProps<T>) {
  const rows = Math.max(grid.rows, 1);
  const cols = Math.max(grid.cols, 1);
  const boxRef = useRef<HTMLUListElement | null>(null);

  const gestureRef = useRef<Gesture | null>(null);
  /* 손짓이 바뀌면 다시 그린다 — 값은 ref 하나이고 이것은 「바뀌었다」는 신호일 뿐이다. */
  const [, redraw] = useReducer((n: number) => n + 1, 0);

  /**
   * 손이 얹힌 칸과 Tab 이 닿는 칸 — **CSS `:hover` 를 쓰지 않는다.**
   *
   * 손짓이 끝나는 순간 브라우저는 얹힘을 **캡처를 걸기 전 자리**로 다시 셈한다. 그래서 끌기를
   * 끝내면 처음 누른 칸이 한 박자 반짝였다. 우리가 이미 손의 자리를 알고 있으므로 여기서 정한다.
   */
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const onDeselectRef = useRef(onDeselect);
  onDeselectRef.current = onDeselect;

  /** 포인터가 가리키는 칸. */
  function cellFrom(e: { clientX: number; clientY: number }): GridCell | null {
    const el = boxRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return cellAt({ width: r.width, height: r.height, cols, rows }, e.clientX - r.left, e.clientY - r.top);
  }

  /** 이 네모가 통째로 비어 있나. */
  function free(p: GridPlacement): boolean {
    if (p.col < 0 || p.row < 0 || p.col + p.colSpan > cols || p.row + p.rowSpan > rows) return false;
    return !items.some((i) => i.col != null && i.row != null && overlaps(p, place(i)));
  }

  /** 손이 있는 자리로 겨눈다 — 그리기·옮기기·크기가 한 길이다. */
  function aim(e: { clientX: number; clientY: number }) {
    const g = gestureRef.current;
    const to = g && cellFrom(e);
    if (!g || !to) return;

    if (g.kind === 'draw') {
      /* **네모는 빈 자리에서만 자란다** — 막히면 그 앞에서 멈춘다. 남의 자리까지 덮게 두면
         손을 뗄 때 아무 일도 못 하고, 사람 눈에는 「끌었는데 반응 없이 사라졌다」가 된다. */
      const next = {
        col: Math.min(g.from.col, to.col), row: Math.min(g.from.row, to.row),
        colSpan: Math.abs(to.col - g.from.col) + 1, rowSpan: Math.abs(to.row - g.from.row) + 1,
      };
      if (free(next)) { g.aim = next; redraw(); }
      return;
    }
    if (to.col !== g.from.col || to.row !== g.from.row) g.moved = true;
    const o = g.origin!;
    /* 옮기기는 **잡은 지점과의 거리**를 지킨다(가운데를 잡았으면 가운데가 따라온다).
       크기는 왼쪽 위를 고정하고 오른쪽 아래를 끈다. */
    const next: GridPlacement = g.kind === 'move'
      ? { ...o, col: o.col + (to.col - g.from.col), row: o.row + (to.row - g.from.row) }
      : { ...o, colSpan: Math.max(to.col - o.col + 1, 1), rowSpan: Math.max(to.row - o.row + 1, 1) };
    if (g.aim && same(g.aim, next)) return;
    /**
     * **놓을 수 있는 자리만 겨눈다** — 그리기와 같은 규칙.
     *
     * 이것이 「끌면 따라오는데 놓으면 제자리」의 원인이었다. 겨누기는 아무 자리나 따라가고
     * 확정할 때만 물었으므로, 판을 넘거나 남과 겹치는 자리를 **미리보기가 보여 주고 나서**
     * 거부했다(7칸짜리를 14행에 두면 21행이 된다). 사람 눈에는 보여 준 대로 놓았는데 아무
     * 일도 안 일어난 것이다. 막히면 **마지막으로 놓을 수 있던 자리에 머문다** — 그러면
     * 보이는 것이 곧 되는 것이고, 확정할 때 다시 물을 것이 없다.
     */
    if (!canPlace(g.itemId!, next)) return;
    g.aim = next;
    redraw();
  }

  function end(commit: boolean) {
    const g = gestureRef.current;
    gestureRef.current = null;
    redraw();
    if (!g || !commit) return;

    if (g.kind === 'draw') {
      const r = g.aim;
      /* 여러 칸을 묶었으면 그 네모에, 아니면 누른 칸에 만든다. */
      onAddAtCell(r && (r.colSpan > 1 || r.rowSpan > 1) ? r : g.from);
      return;
    }
    /* 끈 것은 누른 것이 아니다 — 옮기려던 손짓이 상세를 열면 안 된다. */
    if (!g.moved) {
      const item = items.find((i) => i.id === g.itemId);
      if (item) onSelect(item);
      return;
    }
    /* 보여 준 자리가 곧 놓는 자리다 — 겨누기가 이미 놓을 수 있는 것만 골랐다.
       한 칸도 못 간 채 끌기만 했으면(갈 수 있는 자리가 없었다) 그대로 둔다. */
    if (g.aim && !same(g.origin!, g.aim)) onMove(g.itemId!, g.aim);
  }

  /** 이 이벤트가 이 손짓의 것인가. */
  const mine = (e: React.PointerEvent) => {
    const g = gestureRef.current;
    return g && g.pointerId === e.pointerId ? g : null;
  };

  /**
   * 눌렀다 — 어느 칸인지는 **좌표가 정한다**(무엇을 눌렀는지가 아니라).
   *
   * 한때는 눌린 요소를 거슬러 올라가 칸을 찾았다(`closest('[data-cell]')`). 그런데 칸은 둥근
   * 사각형이고 사이에 틈이 있다 — **틈과 모서리 곡선 바깥은 어느 칸도 아니다.** 거기를 누르면
   * 손짓이 시작조차 안 됐고, 그 자리가 판 전체에 격자무늬로 깔려 있으니 「가끔 안 먹는다」가
   * 됐다. 겨누는 셈(`cellFrom`)은 처음부터 좌표만 봤으므로 미리보기는 멀쩡했다 — 시작만
   * 다른 잣대를 쓰고 있었던 것이다.
   *
   * 잡은 것도 **그 칸을 덮은 장비**로 찾는다. 요소로 찾을 때는 단추가 span 을 통째로 덮어
   * 저절로 맞았지만, 좌표로 보면 가운데를 눌렀을 때 시작 칸이 아니다.
   */
  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0 || gestureRef.current) return;
    const el = e.target as HTMLElement;
    if (el.closest('[data-remove]')) return; // 빼기는 손짓이 아니라 단추다

    const from = cellFrom(e);
    if (!from) return;
    const one = { ...from, colSpan: 1, rowSpan: 1 };
    const item = items.find((i) => i.col != null && i.row != null && overlaps(one, place(i))) ?? null;
    const key = item ? `${item.col},${item.row}` : `${from.col},${from.row}`;

    /* 기본 손짓을 끈다 — 안 끄면 끌기가 **글자 선택**으로도 읽힌다. 초점은 손으로 주되
       **판을 밀지 않는다**(밀리면 손 아래 칸이 바뀌어 처음부터 어긋난다). */
    e.preventDefault();
    boxRef.current?.querySelector<HTMLElement>(`button[data-cell="${key}"]`)?.focus({ preventScroll: true });
    setActiveKey(key);

    gestureRef.current = {
      pointerId: e.pointerId,
      kind: !item ? 'draw' : el.closest('[data-resize]') ? 'resize' : 'move',
      from,
      itemId: item?.id ?? null,
      origin: item ? place(item) : null,
      aim: null,
      moved: false,
    };
    redraw();
    /* 캡처는 **격자**가 쥔다. 못 쥐면 따라갈 수도 없으므로 그 자리에서 접는다 —
       안 그러면 끝을 알리는 `pointerup` 이 영영 오지 않아 화면이 굳는다. */
    try {
      boxRef.current?.setPointerCapture(e.pointerId);
    } catch {
      end(false);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = mine(e);
    if (!g) {
      if (!gestureRef.current) {
        const c = cellFrom(e);
        const k = c ? `${c.col},${c.row}` : null;
        if (k !== hoverKey) setHoverKey(k);
      }
      return;
    }
    if (hoverKey !== null) setHoverKey(null);
    /* 눌린 버튼이 없으면 **우리가 못 본 데서 손을 뗀 것**이다 — 물린다. */
    if (e.buttons === 0) { end(false); return; }
    /* 창 밖은 놓을 자리가 아니다 — 겨누지 않고, 들어오면 그 자리에서 이어진다. */
    if (inWindow(e)) aim(e);
  }

  /* Esc — **한 층만** 물린다. 물렸으면 거기서 끝낸다(안 그러면 바깥 층까지 함께 반응해,
     끌던 것을 물리려던 Esc 가 고른 설비 품목까지 풀어 편집 화면이 닫혔다). */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isCancelKey(e)) return;
      if (gestureRef.current) { e.stopPropagation(); end(false); return; }
      if (selectedId != null) { e.stopPropagation(); onDeselectRef.current?.(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // ── 그리기 ────────────────────────────────────────────────────────────────
  const g = gestureRef.current;
  const dragging = g != null;
  /* 끌고 있는 것은 **겨눈 자리**에 그린다 — 원래 자리에는 빈칸이 남는다. */
  const moving = g && g.kind !== 'draw' && g.aim ? { id: g.itemId!, at: g.aim } : null;
  const drawing = g && g.kind === 'draw' ? g.aim : null;

  /** 칸 → 그 칸에서 시작하는 장비 / 그 칸을 덮은 장비의 시작 칸. */
  const startsAt = new Map<string, T>();
  const owner = new Map<string, string>();
  for (const item of items) {
    if (item.col == null || item.row == null) continue;
    const at = moving?.id === item.id ? moving.at : place(item);
    startsAt.set(`${at.col},${at.row}`, item);
    for (let r = 0; r < at.rowSpan; r++)
      for (let c = 0; c < at.colSpan; c++) owner.set(`${at.col + c},${at.row + r}`, `${at.col},${at.row}`);
  }
  /* 덮인 칸에 손이 얹혔으면 그 자리에 선 장비가 얹힌 것이다. */
  const hovered = hoverKey ? owner.get(hoverKey) ?? hoverKey : null;

  const rect = drawing
    ? { at: drawing, text: `${drawing.colSpan}×${drawing.rowSpan}` }
    : pending ? { at: pending.at, text: pending.label } : null;

  /* Tab 이 닿는 칸 하나 — 마지막으로 짚은 칸 → 고른 장비 → 첫 칸. */
  const selectedKey = [...startsAt].find(([, i]) => i.id === selectedId)?.[0] ?? null;
  const firstKey = (() => {
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const k = `${c},${r}`;
        if (startsAt.has(k) || !owner.has(k)) return k;
      }
    return null;
  })();
  const stop = activeKey ?? selectedKey ?? firstKey;

  const cells: ReactNode[] = [];
  if (rect) {
    cells.push(
      <li key="rect" className="pointer-events-none"
        style={{ gridColumn: `${rect.at.col + 1} / span ${rect.at.colSpan}`, gridRow: `${rect.at.row + 1} / span ${rect.at.rowSpan}`, zIndex: 12 }}>
        <div className="flex h-full w-full items-center justify-center rounded border-2 border-primary bg-info-bg text-xs font-medium text-primary">
          <span className="truncate px-1">{rect.text}</span>
        </div>
      </li>,
    );
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const key = `${col},${row}`;
      const item = startsAt.get(key);
      if (!item && owner.has(key)) continue; // 덮인 칸은 그리지 않는다
      const at = item ? (moving?.id === item.id ? moving.at : place(item)) : { col, row, colSpan: 1, rowSpan: 1 };
      const tone = item ? toneOf?.(item) ?? null : null;

      cells.push(
        <li key={key} style={{ gridColumn: `${at.col + 1} / span ${at.colSpan}`, gridRow: `${at.row + 1} / span ${at.rowSpan}` }}>
          <button
            type="button"
            data-cell={key}
            tabIndex={stop === key ? 0 : -1}
            aria-label={item ? `${item.name}, ${cellLabel(at.col, at.row)}` : `${cellLabel(col, row)}, 비어 있음. 눌러서 추가`}
            title={item ? `${item.name} · ${cellLabel(at.col, at.row)}` : `${cellLabel(col, row)} (비어 있음)`}
            className={cn(
              'relative flex h-full w-full cursor-pointer select-none items-center justify-center overflow-hidden rounded px-1 text-center text-xs transition-colors',
              /* 초점 테두리는 **안쪽**에 — 밖으로 그리면 맞붙은 옆 칸과 위에 덮인 네모를 뚫는다. */
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
              item
                ? cn('border border-line bg-surface text-content',
                    !dragging && hovered === key && selectedId !== item.id && 'bg-surface-3',
                    selectedId === item.id && 'ring-2 ring-inset ring-primary')
                : cn('border border-dashed border-line/50 text-content-faint',
                    !dragging && hovered === key && 'border-solid border-primary bg-info-bg text-primary'),
              item && 'cursor-grab active:cursor-grabbing',
            )}
            onFocus={() => setActiveKey(key)}
            onKeyDown={(e) => {
              const step: Record<string, [number, number]> = {
                ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1],
              };
              if (step[e.key]) {
                e.preventDefault();
                const [dc, dr] = step[e.key]!;
                /* 누른 방향으로 한 칸씩 밀며 **단추가 있는 칸**을 찾는다(덮인 칸은 그 장비의
                   시작 칸으로). 없으면 움직이지 않는다 — 가장자리에서 멈춘다. */
                for (let c = col + dc, r = row + dr; c >= 0 && r >= 0 && c < cols && r < rows; c += dc, r += dr) {
                  const k = owner.get(`${c},${r}`) ?? `${c},${r}`;
                  if (k === key) continue; // 지금 서 있는 장비의 제 몸 위는 지나간다
                  const el = boxRef.current?.querySelector<HTMLElement>(`button[data-cell="${k}"]`);
                  if (el) { setActiveKey(k); el.focus(); return; }
                }
                return;
              }
              if ((e.key === 'Delete' || e.key === 'Backspace') && item && onRemove) {
                e.preventDefault();
                onRemove(item);
                return;
              }
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              if (item) onSelect(item);
              else onAddAtCell({ col, row });
            }}
          >
            {item ? (
              <span className="flex min-h-0 min-w-0 max-h-full max-w-full flex-col items-center leading-tight">
                <span className="min-w-0 max-w-full truncate">{item.name}</span>
                {at.rowSpan > 1 && trailing?.(item)}
              </span>
            ) : (
              /* 빈 자리의 `+` — **얹혔을 때만**. 초점에도 켜면 끌기를 끝낸 자리에 초점이
                 남아 그 칸이 켜진 채로 남는다(「처음 누른 자리가 반짝인다」가 그것이었다). */
              <span className={cn('text-base leading-none text-primary transition-opacity',
                !dragging && hovered === key ? 'opacity-100' : 'opacity-0')}>+</span>
            )}
            {tone && (
              <span aria-hidden className={cn('pointer-events-none absolute left-1 top-1 h-2 w-2 rounded-full ring-1 ring-content-faint/60', LAMP[tone])} />
            )}
            {item && onRemove && (
              <span
                role="button"
                tabIndex={-1}
                data-remove
                aria-label={`${item.name} 빼기`}
                title="구성에서 빼기"
                className={cn('absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded',
                  'text-content-faint hover:bg-danger-bg hover:text-danger transition-opacity',
                  hovered === key || selectedId === item.id ? 'opacity-100' : 'opacity-0')}
                /* 누르는 순간 지우지 않는다 — 잘못 눌렀으면 손가락을 빼서 물릴 수 있어야 한다. */
                onClick={() => onRemove(item)}
              >
                <X size={12} />
              </span>
            )}
            {item && (
              <span
                role="separator"
                data-resize
                aria-label={`${item.name} 크기 조절`}
                className={cn('absolute bottom-0 right-0 h-2.5 w-2.5 cursor-nwse-resize transition-opacity',
                  hovered === key || selectedId === item.id ? 'opacity-100' : 'opacity-0')}
              >
                <span className="block h-full w-full rounded-br bg-primary/50" />
              </span>
            )}
          </button>
        </li>,
      );
    }
  }

  /* `fill` 이면 상자에 맞춘다(랙 정면도는 한눈에 들어와야 한다). 고정 상자면 최소 높이를
     지키고 넘치면 스크롤한다 — 좁은 패널에서 칸이 12px 로 줄면 누를 수가 없다. */
  const rowRule = {
    gridTemplateRows: fill ? `repeat(${rows}, minmax(0, 1fr))` : `repeat(${rows}, minmax(${GRID_ROW_H}px, 1fr))`,
  };

  return (
    <InsetBox
      className={cn('mt-1 flex gap-1 p-1.5 shadow-inner', fill ? 'min-h-0 flex-1 overflow-hidden' : 'overflow-y-auto')}
      style={boxHeight != null ? { height: boxHeight } : undefined}
      /* 상자의 **제 여백**(눈금 옆·판 아래)을 누르면 푼다 — 판 안은 판이 받는다. */
      onPointerDown={(e) => { if (e.target === e.currentTarget && selectedId != null) onDeselect?.(); }}
    >
      {/* 단 눈금 — 「몇 단인가」를 판 옆에서 읽는다. 판 밖에 두는 이유: 포인터를 칸으로
          셈하는 상자에 섞이면 눈금 폭만큼 칸 계산이 밀린다. */}
      <ol aria-hidden className="grid shrink-0 gap-0.5 text-right text-xs tabular-nums text-content-faint" style={rowRule}>
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="flex items-center justify-end pr-0.5 leading-none">{i + 1}</li>
        ))}
      </ol>
      <div className="min-w-0 flex-1 overflow-x-auto">
        <ul
          ref={boxRef}
          /* `touch-none`: 이 판에서 끄는 것은 **우리 손짓**이지 화면 굴리기가 아니다. 안 걸면
             트랙패드·터치에서 브라우저가 도중에 가져가고(`pointercancel`) 손짓이 말없이 사라진다. */
          className="grid h-full touch-none select-none gap-0.5"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHoverKey(null)}
          onPointerUp={(e) => { if (mine(e)) end(inWindow(e)); }}
          onPointerCancel={(e) => { if (mine(e)) end(false); }}
          onLostPointerCapture={() => { if (gestureRef.current) end(false); }}
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, minWidth: cols * GRID_COL_MIN, ...rowRule }}
        >
          {cells}
        </ul>
      </div>
    </InsetBox>
  );
}
