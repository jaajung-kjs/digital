import { useEffect, useRef, useState, type ReactNode } from 'react';
import { slotNumber, type Grid } from '@twin/core';
import { cn, SELECTABLE } from '../../components/ui';
import {
  cellAt, gridDragTo, gridPlacementChanged, startGridDrag,
  type GridCell, type GridDragKind, type GridDragSession, type GridPlacement,
} from '../gridDrag';

/**
 * 격자에 놓이는 것 — **자산이든 형판 부품이든** 이만큼만 있으면 그린다.
 *
 * 상세 패널은 실제 자산을, 형판 편집기는 아직 자산이 아닌 부품을 놓는다. 둘은 같은 판을
 * 봐야 한다 — 형판에서 짠 모습이 놓고 나면 달라 보이면 짜는 뜻이 없다.
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
  /** 빈 자리를 눌렀을 때 — 그 칸에 바로 추가한다. */
  onAddAtCell: (cell: GridCell) => void;
  /** 자리를 옮기거나 크기를 바꿨을 때 — 검증을 통과한 것만 온다. */
  onMove: (itemId: string, placement: GridPlacement) => void;
  /** 이 자리에 놓을 수 있는가 — 겹침·범위를 부르는 쪽이 판정한다. */
  canPlace: (itemId: string, placement: GridPlacement) => boolean;
  /** 이름 뒤에 붙는 것 — 자산이면 포트 요약, 형판이면 타입 이름. */
  trailing?: (item: T) => ReactNode;
  /** 지금 골라져 있는 것 — 형판 편집기가 고른 부품을 표시할 때 쓴다. */
  selectedId?: string | null;
}

/**
 * 한 단(段)의 높이(px) — **열 폭은 상자를 꽉 채우고, 높이만 못 박는다**.
 *
 * 칸을 정사각형으로 두면 상자 오른쪽에 죽은 여백이 남고(4열이면 208/333px), 12행짜리 판은
 * 세로로 넘쳐 스크롤이 생긴다. 무엇보다 물리적으로 거짓이다 — 19인치 랙의 1U 는 483×44mm 로
 * 가로가 열 배 넘게 길다. DCIM 들도 그렇게 그린다(NetBox 기본값 `unit_width=300,
 * unit_height=35`).
 *
 * 세로로만 쌓이는 판으로 보였던 원인은 칸 모양이 아니라 **1열**이었다. 열이 여럿이면
 * 납작한 칸이라도 XY 격자로 읽힌다 — 랙 정면도가 그렇다.
 */
export const GRID_ROW_H = 30;

/**
 * 열 하나의 최소 폭(px) — 이보다 좁아지면 판이 가로로 넘친다.
 *
 * 카드 슬롯 단위로 잘게 나눈 판(섀시가 든 랙이면 10열)을 좁은 상세 패널에 그대로 욱여넣으면
 * 칸이 뭉개진다. 줄이는 대신 넘긴다 — 랙 정면도는 원래 스크롤해서 보는 그림이다.
 */
const GRID_COL_MIN = 30;

/**
 * 가로쓰기가 들어가는 최소 칸 폭(px) — 한글 서너 자.
 *
 * 이보다 좁고 세로로 긴 칸은 **글씨를 세로로 돌린다**. 실물이 그렇다: 섀시에 꽂히는 카드는
 * 좁고 길어서 라벨을 세로로 읽는다(CTRU·MCU·PIU·LIU). 가로로 쓰면 「CT…」로 잘릴 뿐이다.
 * `text-orientation: mixed` 라서 한글은 세워지고 영문만 눕는다.
 */
const LABEL_MIN_W = 52;

/**
 * 설비 안의 자리 — **XY 격자**다.
 *
 * 예전에는 자리가 1차원 슬롯이었다(랙의 「슬롯 12칸」). 그래서 세로로 쌓이는 것밖에 표현할
 * 수 없었는데, 실제 판에는 가로로 나란한 모듈도 있고 세로로 긴 모듈도 있다. 슬롯은 폭이
 * 격자 전체인 1열짜리 격자였을 뿐이라, 격자를 그대로 두면 슬롯은 그 특수한 경우가 된다.
 *
 * 그래서 칸은 **정사각형**이고, 부품은 격자 안 아무 자리에나 놓이며 **두 축 모두** 늘어난다
 * (오른쪽 아래 모서리 손잡이). 열이 몇이든 번호는 저장하지 않고 격자에서 유도하므로
 * 자리와 번호가 어긋날 수 없다(행 우선).
 *
 * 끌어서 옮기고 모서리로 크기를 바꾼다 — 수학은 `gridDrag.ts` 에 순수 함수로 있다.
 */
export function AssemblyGrid<T extends GridItem>({
  grid, items, onSelect, onAddAtCell, onMove, canPlace, trailing, selectedId,
}: AssemblyGridProps<T>) {
  const rows = Math.max(grid.rows, 1);
  const cols = Math.max(grid.cols, 1);

  const boxRef = useRef<HTMLUListElement | null>(null);
  /** 칸 폭 — 글씨를 눕힐지 판단하려면 실제 폭을 알아야 한다(열 수만으로는 모른다). */
  const [boxWidth, setBoxWidth] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setBoxWidth(entry!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const colWidth = boxWidth > 0 ? boxWidth / cols : 0;
  const sessionRef = useRef<GridDragSession | null>(null);
  /** 끌고 있는 동안의 미리보기 — 놓기 전에는 저장하지 않는다. */
  const [preview, setPreview] = useState<{ itemId: string; placement: GridPlacement; ok: boolean } | null>(null);

  /** 포인터가 가리키는 칸 — 격자 상자 기준 상대 좌표로 셈한다. */
  function cellFromPointer(e: { clientX: number; clientY: number }): GridCell | null {
    const el = boxRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return cellAt({ width: r.width, height: r.height, cols, rows }, e.clientX - r.left, e.clientY - r.top);
  }

  function beginDrag(kind: GridDragKind, item: T, e: React.PointerEvent) {
    const origin: GridPlacement = {
      col: item.col ?? 0, row: item.row ?? 0, colSpan: item.colSpan ?? 1, rowSpan: item.rowSpan ?? 1,
    };
    const grab = cellFromPointer(e) ?? { col: origin.col, row: origin.row };
    sessionRef.current = startGridDrag(kind, item.id, origin, grab);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const session = sessionRef.current;
    if (!session) return;
    const target = cellFromPointer(e);
    if (!target) return;
    const placement = gridDragTo(session, target);
    session.moved = session.moved || gridPlacementChanged(session.origin, placement);
    if (!session.moved) return;
    setPreview({ itemId: session.assetId, placement, ok: canPlace(session.assetId, placement) });
  }

  function endDrag() {
    const session = sessionRef.current;
    sessionRef.current = null;
    const pv = preview;
    setPreview(null);
    // 끌지 않았으면 그냥 누른 것이다 — 선택은 버튼의 onClick 이 맡는다.
    if (!session || !session.moved || !pv) return;
    if (pv.ok && gridPlacementChanged(session.origin, pv.placement)) onMove(session.assetId, pv.placement);
  }

  /** `열,행` → 그 칸에서 시작하는 것. */
  const byCell = new Map<string, T>();
  /** 이미 무엇이 덮고 있는 칸 — span 이 지나가는 자리다. */
  const covered = new Set<string>();
  for (const item of items) {
    if (item.col == null || item.row == null) continue;
    byCell.set(`${item.col},${item.row}`, item);
    for (let r = 0; r < (item.rowSpan ?? 1); r++) {
      for (let c = 0; c < (item.colSpan ?? 1); c++) covered.add(`${item.col + c},${item.row + r}`);
    }
  }

  const cells: ReactNode[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const key = `${col},${row}`;
      const item = byCell.get(key);
      // 시작 칸이 아니면서 누가 덮고 있으면 그 칸은 그리지 않는다(span 이 대신 차지한다).
      if (!item && covered.has(key)) continue;

      /* 끌고 있는 중이면 그것은 미리보기 자리에 그린다 — 원래 자리에는 빈칸이 남는다. */
      const pv = item && preview?.itemId === item.id ? preview : null;
      const at = pv ? pv.placement : { col, row, colSpan: item?.colSpan ?? 1, rowSpan: item?.rowSpan ?? 1 };
      /* 좁고 세로로 긴 칸이면 글씨를 눕힌다 — 섀시 카드가 실물에서 그렇게 읽힌다. */
      const cellW = at.colSpan * colWidth;
      const vertical = colWidth > 0 && cellW < LABEL_MIN_W && at.rowSpan * GRID_ROW_H > cellW;

      cells.push(
        <li
          key={key}
          style={{
            gridColumn: `${at.col + 1} / span ${at.colSpan}`,
            gridRow: `${at.row + 1} / span ${at.rowSpan}`,
          }}
        >
          {/* 빈 자리도 누를 수 있다 — 예전에는 아무 반응이 없어서, 추가하려면 위 버튼을 눌러
              모달에서 자리를 다시 골라야 했다. 눈앞의 빈칸을 누르는 것이 자연스럽다. */}
          <button
            type="button"
            className={cn(
              'group relative flex h-full w-full items-center justify-center overflow-hidden rounded px-1 text-center text-xs',
              // 꽂혀 있는 것만 칸으로 보인다 — 빈 자리는 배경 그대로 둔다.
              item
                ? cn('border border-line bg-surface text-content', SELECTABLE)
                : cn('border border-dashed border-line/50 text-content-faint', SELECTABLE),
              item && 'cursor-grab touch-none active:cursor-grabbing',
              item && selectedId === item.id && 'ring-2 ring-inset ring-primary',
              // 놓을 수 없는 자리면 그렇다고 말한다 — 놓아 봐야 되돌아가는 것보다 낫다.
              pv && (pv.ok ? 'ring-2 ring-primary' : 'ring-2 ring-danger opacity-70'),
            )}
            title={
              item
                ? `${item.name} · 자리 ${slotNumber(cols, at.col, at.row)}`
                : `자리 ${slotNumber(cols, col, row)} (비어 있음)`
            }
            onClick={() => (item ? onSelect(item) : onAddAtCell({ col, row }))}
            onPointerDown={(e) => item && e.button === 0 && beginDrag('move', item, e)}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {/* 번호는 칸이 아니라 왼쪽 눈금이 맡는다 — 칸마다 번호를 박으면 4열 12행에서 번호가
                48개 흩어지고, 정작 부품이 놓인 칸은 이름과 번호가 자리를 다툰다.
                랙 정면도의 어법대로 「몇 단」은 눈금이, 「무엇인가」는 칸이 말한다. */}
            {item ? (
              /* 한 칸짜리에는 이름만 — 두 줄을 욱여넣으면 둘 다 못 읽는다. 전체 이름은 툴팁에 있다. */
              <span
                className={cn(
                  'flex min-h-0 min-w-0 max-h-full max-w-full items-center leading-tight',
                  vertical ? 'flex-row' : 'flex-col',
                )}
                style={vertical ? { writingMode: 'vertical-rl' } : undefined}
              >
                <span className="min-h-0 min-w-0 max-h-full max-w-full truncate">{item.name}</span>
                {at.rowSpan > 1 && !vertical && trailing?.(item)}
              </span>
            ) : (
              <span className="text-base leading-none text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                +
              </span>
            )}
            {/* 크기 손잡이 — 오른쪽 아래 모서리. **두 축 모두** 늘어난다(왼쪽 위 고정).
                예전에는 아래 변에만 있어서 세로로밖에 못 늘렸고, 그래서 판이 슬롯처럼 굳었다. */}
            {item && (
              <span
                role="separator"
                aria-label={`${item.name} 크기 조절`}
                className="absolute bottom-0 right-0 h-2.5 w-2.5 cursor-nwse-resize touch-none opacity-0 transition-opacity group-hover:opacity-100"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  beginDrag('resize', item, e);
                }}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                <span className="block h-full w-full rounded-br bg-primary/50" />
              </span>
            )}
          </button>
        </li>,
      );
    }
  }

  const rowRule = { gridTemplateRows: `repeat(${rows}, ${GRID_ROW_H}px)` };

  return (
    <div className="mt-1 flex gap-1 rounded border border-line bg-surface-2 p-1.5 shadow-inner">
      {/* 단 눈금 — 랙 정면도의 U 눈금과 같다. 「몇 단인가」를 판 옆에서 한 번에 읽는다.
          격자 바깥에 두는 이유: 포인터 좌표를 칸으로 셈하는 상자(`boxRef`)에 섞이면
          눈금 폭만큼 칸 계산이 밀린다. */}
      <ol
        aria-hidden
        className="grid shrink-0 gap-0.5 text-right text-[10px] tabular-nums text-content-faint"
        style={rowRule}
      >
        {Array.from({ length: rows }, (_, r) => (
          <li key={r} className="flex items-center justify-end pr-0.5 leading-none">{r + 1}</li>
        ))}
      </ol>
      {/* 칸은 균일해야 한다 — 포인터 좌표에서 칸을 셈하려면 그렇다. 열은 상자를 꽉 채우되
          최소 폭 아래로는 줄지 않고 가로로 넘긴다(랙 정면도는 스크롤해서 보는 그림이다).
          포인터 셈은 화면 좌표 기준이라 가로로 밀려 있어도 그대로 맞는다. */}
      <div className="min-w-0 flex-1 overflow-x-auto">
        <ul
          ref={boxRef}
          className="grid gap-0.5"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            minWidth: cols * GRID_COL_MIN,
            ...rowRule,
          }}
        >
          {cells}
        </ul>
      </div>
    </div>
  );
}
