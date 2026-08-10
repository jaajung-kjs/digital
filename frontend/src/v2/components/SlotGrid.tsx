import { useRef, useState, type ReactNode } from 'react';
import { slotNumber } from '@twin/core';
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

/** 격자를 가진 자리 명세 — 열·행과 span 허용 여부만 본다. */
export interface GridSpec {
  name: string;
  cols: number;
  rows: number | null;
  allowSpan: boolean;
}

export interface SlotGridProps<T extends GridItem> {
  spec: GridSpec;
  items: readonly T[];
  onSelect: (item: T) => void;
  /** 빈 자리를 눌렀을 때 — 그 칸에 바로 추가한다. */
  onAddAtCell: (cell: GridCell) => void;
  /** 자리를 옮기거나 크기를 바꿨을 때 — 검증을 통과한 것만 온다. */
  onMove: (itemId: string, placement: GridPlacement) => void;
  /** 이 자리에 놓을 수 있는가 — 겹침·범위·span 허용을 부르는 쪽이 판정한다. */
  canPlace: (itemId: string, placement: GridPlacement) => boolean;
  /** 이름 뒤에 붙는 것 — 자산이면 포트 요약, 형판이면 타입 이름. */
  trailing?: (item: T) => ReactNode;
  /** 지금 골라져 있는 것 — 형판 편집기가 고른 부품을 표시할 때 쓴다. */
  selectedId?: string | null;
}

/** 자리 한 칸의 높이(px) — 여러 칸을 차지하는 장비는 이 배수만큼 높아진다.
 *  자유형 목록도 같은 높이를 써야 함체 종류에 따라 화면이 딴판이 되지 않는다. */
export const SLOT_ROW_HEIGHT = 26;

/**
 * 함체 안의 자리 — **격자**로 그린다.
 *
 * 세로로 쌓는 이유: 랙·함체는 세로로 자리가 배열된 물리 장비다. 예전에는 `grid-cols-6`
 * 이라 384px 상세 패널에서 칸이 56px 밖에 안 됐고, 장비 이름이 "SCA…", "통합…" 으로
 * 잘려 무엇이 꽂혀 있는지 알 수 없었다.
 *
 * 그래서 **열은 명세가 선언한 만큼만** 나눈다 — 랙은 1열이라 한 줄씩 쌓이고, 분전반
 * 조서처럼 2열이면 좌우로 갈린다(1·2가 첫 행). 번호는 저장하지 않고 격자에서 유도하므로
 * 자리와 번호가 어긋날 수 없다.
 *
 * 바깥 테두리 하나가 함체이고 그 안에 자리가 있다 — 포트 판의 백플레인과 같은 어법이다.
 * 예전에는 **자리마다** 점선 상자를 둘러 12칸짜리 랙이 점선 12개 + 파란 `+ 추가` 12개가 되어,
 * 정작 무엇이 꽂혀 있는지보다 빈칸이 더 눈에 띄었다.
 *
 * 끌어서 옮기고 아래 손잡이로 크기를 바꾼다 — 수학은 `gridDrag.ts` 에 순수 함수로 있다.
 */
export function SlotGrid<T extends GridItem>({
  spec, items, onSelect, onAddAtCell, onMove, canPlace, trailing, selectedId,
}: SlotGridProps<T>) {
  const rows = spec.rows!;
  const cols = Math.max(spec.cols, 1);

  const boxRef = useRef<HTMLUListElement | null>(null);
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
    if (kind === 'resize' && !spec.allowSpan) return;
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
      const first = slotNumber(cols, at.col, at.row);
      // 여러 칸을 차지하면 "3–5" 처럼 범위로 적는다.
      const last = slotNumber(cols, at.col + at.colSpan - 1, at.row + at.rowSpan - 1);
      const label = last > first ? `${first}–${last}` : String(first);

      cells.push(
        <li
          key={key}
          style={{
            minHeight: at.rowSpan * SLOT_ROW_HEIGHT,
            gridColumn: `${at.col + 1} / span ${at.colSpan}`,
            gridRow: `${at.row + 1} / span ${at.rowSpan}`,
          }}
        >
          {/* 빈 자리도 누를 수 있다 — 예전에는 아무 반응이 없어서, 추가하려면 위 버튼을 눌러
              모달에서 자리를 다시 골라야 했다. 눈앞의 빈칸을 누르는 것이 자연스럽다. */}
          <button
            type="button"
            className={cn(
              'group relative flex h-full w-full items-center gap-2 rounded px-2 text-left text-sm',
              // 꽂혀 있는 것만 칸으로 보인다 — 빈 자리는 배경 그대로 둔다.
              item ? cn('border border-line bg-surface text-content', SELECTABLE) : cn('text-content-faint', SELECTABLE),
              item && 'cursor-grab touch-none active:cursor-grabbing',
              item && selectedId === item.id && 'ring-2 ring-inset ring-primary',
              // 놓을 수 없는 자리면 그렇다고 말한다 — 놓아 봐야 되돌아가는 것보다 낫다.
              pv && (pv.ok ? 'ring-2 ring-primary' : 'ring-2 ring-danger opacity-70'),
            )}
            title={item?.name}
            onClick={() => (item ? onSelect(item) : onAddAtCell({ col, row }))}
            onPointerDown={(e) => item && e.button === 0 && beginDrag('move', item, e)}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <span className="w-8 shrink-0 text-right text-xs text-content-faint">{label}</span>
            <span className="min-w-0 flex-1 truncate">{item ? item.name : '비어 있음'}</span>
            {item && trailing?.(item)}
            {!item && (
              <span className="shrink-0 text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                + 추가
              </span>
            )}
            {/* 크기 손잡이 — 아래 모서리. span 을 허용하지 않는 컨테이너에는 달지 않는다.
                평면도 핸들과 같은 어법으로 **반대변(왼쪽 위)을 고정**하고 끈다. */}
            {item && spec.allowSpan && (
              <span
                role="separator"
                aria-label={`${item.name} 크기 조절`}
                className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize touch-none opacity-0 transition-opacity group-hover:opacity-100"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  beginDrag('resize', item, e);
                }}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                <span className="mx-auto block h-full w-8 rounded-full bg-primary/40" />
              </span>
            )}
          </button>
        </li>,
      );
    }
  }

  return (
    <div className="mt-1 rounded border border-line bg-surface-2 p-1.5 shadow-inner">
      {/* 행 높이를 못 박아 둔다 — 포인터 좌표에서 칸을 셈하려면 격자가 균일해야 한다. */}
      <ul
        ref={boxRef}
        className="grid gap-0.5"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, ${SLOT_ROW_HEIGHT}px)`,
        }}
      >
        {cells}
      </ul>
    </div>
  );
}
