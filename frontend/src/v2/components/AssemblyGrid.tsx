import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { type Grid, cellLabel } from '@twin/core';
import { cn, type BadgeStatus, isCancelKey, InsetBox } from '../../components/ui';
import {
  cellAt, gridDragTo, gridPlacementChanged, startGridDrag,
  type GridCell, type GridDragKind, type GridDragSession, type GridPlacement,
} from '../gridDrag';
/* 「창 밖은 놓을 자리가 아니다」는 판이든 도면이든 같은 규칙이라 한 곳에 있다. */
import { inWindow } from '../canvas/drag';

/**
 * 격자에 놓이는 것 — **자산이든 설비 품목 장비가든** 이만큼만 있으면 그린다.
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
  /** 빈 자리를 눌렀을 때 — 그 칸에 바로 추가한다. */
  /** 빈 자리에 만든다 — 여러 칸을 끌었으면 그 크기까지 온다. */
  onAddAtCell: (at: GridCell & { colSpan?: number; rowSpan?: number }) => void;
  /** 자리를 옮기거나 크기를 바꿨을 때 — 검증을 통과한 것만 온다. */
  onMove: (itemId: string, placement: GridPlacement) => void;
  /** 이 자리에 놓을 수 있는가 — 겹침·범위를 부르는 쪽이 판정한다. */
  canPlace: (itemId: string, placement: GridPlacement) => boolean;
  /** 이름 뒤에 붙는 것 — 자산이면 포트 요약, 설비 품목이면 타입 이름. */
  trailing?: (item: T) => ReactNode;
  /** 지금 골라져 있는 것 — 설비 품목 편집기가 고른 장비를 표시할 때 쓴다. */
  selectedId?: string | null;
  /**
   * 판이 앉을 **상자의 높이**(px). 주지 않으면 남는 자리를 다 쓴다(`fill`).
   *
   * 격자 높이는 행 수에 그대로 비례한다(1행 30px ~ 20행 600px, 20배). 그대로 두면 설비마다
   * 화면 모양이 달라진다. 상자를 못 박거나(px) 자리를 다 쓰게 하면(`fill`) 1×1 이든
   * 10×20 이든 **같은 자리**를 차지한다. 넘치는 행은 상자 안에서 스크롤한다 — 칸 크기는
   * 어디서나 같아야 하므로 줄여서 담지 않는다.
   */
  boxHeight?: number;
  /** 부모가 주는 세로 자리를 다 쓴다 — 캔버스가 화면 아래까지 서야 할 때. */
  fill?: boolean;
  /**
   * 고른 것을 푼다 — 빈 곳을 누르거나 Esc 를 눌렀을 때.
   *
   * **격자가 이 길을 갖는다.** 쓰는 곳마다 따로 달면 한 곳을 빠뜨린다(실제로 설비 편집기만
   * 빠져서, 한 번 고르면 푸는 길이 아예 없었다). 같은 것을 다시 누르면 풀리는 것은
   * `onSelect` 를 받는 쪽이 정한다 — 거기서는 「무엇을 골랐나」를 알고 있기 때문이다.
   */
  onDeselect?: () => void;
  /**
   * **지금 무엇을 넣을지 묻는 중인 자리** — 그동안 그 네모가 판에 남는다.
   *
   * 끌어서 크기를 잡고 손을 떼면 상자가 뜨는데, 그때 미리보기를 지우면 상자가 「어디에,
   * 얼마만 한 크기로」 넣을지 묻는 동안 정작 그 답이 화면에서 사라진다 — 무엇을 넣고 있는
   * 중인지 기억에 의존하게 된다. 확정하거나 물릴 때까지 그림은 남아 있는 것이 도면 편집기의
   * 어법이다.
   *
   * 무엇이라 적을지는 **부르는 쪽이 준다**(`label`). 끄는 동안에는 `3×2` 처럼 크기를 적는
   * 것이 맞다 — 그때 고르는 것이 크기다. 손을 뗀 뒤에는 크기가 이미 정해졌고 상자가 그것을
   * 적고 있으므로, 판에는 **무엇이 들어올 자리인지**를 적는다(「새 자산」·「새 장비」).
   */
  pending?: { at: GridPlacement; label: string } | null;
  /**
   * 이 장비를 구성에서 뺀다 — 칸에 얹히는 호버 X.
   *
   * 없으면 X 가 안 뜬다(읽기 전용 판). 지우기는 되돌리기 어려우므로 확인은 **부르는 쪽**이
   * 한다 — 설비 품목 초안은 저장 전이라 물을 것이 없고, 놓인 자산은 물어야 한다.
   */
  onRemove?: (item: T) => void;
  /**
   * 이 칸에 표시등을 켤 것인가 — 켠다면 무슨 빛으로.
   *
   * 어휘가 정한 빛(`assetStatusTone`)을 그대로 받는다. 여기서 상태값을 보고 색을 고르면
   * (`if (status === 'fault')`) 상태를 하나 늘릴 때 판이 조용히 무색으로 남는다.
   * 설비 품목 편집기의 장비는 아직 자산이 아니라 상태가 없으므로 이 프롭을 주지 않는다.
   */
  toneOf?: (item: T) => BadgeStatus | null;
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
 * 표시등의 빛 — 어휘의 `tone` 하나당 한 줄.
 *
 * **글자용 상태색이 아니라 표시등 토큰(`--lamp-*`)을 쓴다.** 글자색은 흰 바탕에 읽히라고
 * 어둡게 깎은 색이라 셋의 명도가 비슷하고, 그래서 8px 점으로는 색이 갈리지 않았다.
 */
const LAMP: Record<BadgeStatus, string> = {
  success: 'bg-lamp-success',
  warning: 'bg-lamp-warning',
  danger: 'bg-lamp-danger',
  info: 'bg-info',
  neutral: 'bg-content-faint',
};

/** 가장자리에서 판이 밀리기 시작하는 폭(px)과 최대 속도(px/프레임). */

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
 * 그래서 칸은 **정사각형**이고, 장비는 격자 안 아무 자리에나 놓이며 **두 축 모두** 늘어난다
 * (오른쪽 아래 모서리 손잡이). 열이 몇이든 번호는 저장하지 않고 격자에서 유도하므로
 * 자리와 번호가 어긋날 수 없다(행 우선).
 *
 * 끌어서 옮기고 모서리로 크기를 바꾼다 — 수학은 `gridDrag.ts` 에 순수 함수로 있다.
 */
export function AssemblyGrid<T extends GridItem>({
  grid, items, onSelect, onAddAtCell, onMove, canPlace, trailing, selectedId, toneOf, boxHeight, fill,
  onDeselect, onRemove, pending,
}: AssemblyGridProps<T>) {
  const rows = Math.max(grid.rows, 1);
  const cols = Math.max(grid.cols, 1);

  const boxRef = useRef<HTMLUListElement | null>(null);
  /** 칸 폭 — 글씨를 눕힐지 판단하려면 실제 폭을 알아야 한다(열 수만으로는 모른다). */
  /* 창 리스너는 한 번만 달고 최신 처리기는 ref 로 읽는다 — 재등록하면 그사이 눌린 키를 놓친다. */
  const onDeselectRef = useRef(onDeselect);
  onDeselectRef.current = onDeselect;

  const [boxWidth, setBoxWidth] = useState(0);
  const [boxHeightPx, setBoxHeightPx] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setBoxWidth(entry!.contentRect.width);
      setBoxHeightPx(entry!.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const colWidth = boxWidth > 0 ? boxWidth / cols : 0;
  /* 행 높이는 이제 고정이 아니다(`fill` 이면 상자에 맞춰 나뉜다) — 재 본 값을 쓴다.
     상수(`GRID_ROW_H`)로 셈하면 20행 판에서 글씨를 눕힐지 말지를 잘못 고른다. */
  const rowHeight = fill && boxHeightPx > 0 ? boxHeightPx / rows : GRID_ROW_H;
  /**
   * 지금 벌어지는 손짓 — **값 하나가 전부다.**
   *
   * 예전에는 한 손짓이 아홉 조각에 흩어져 있었다(무엇을 잡았나·미리보기·그리는 네모·끄는
   * 중인가·마지막 손 자리·밀기 루프…). 그중 둘은 같은 값을 ref 와 state 에 **이중으로**
   * 들고 있었다 — 「끝낼 때는 ref 를 읽어야 한다」는 규칙이 필요했던 이유이자, 조각 둘이
   * 어긋날 때마다 새 버그가 나던 이유다. 고칠 때마다 다른 데가 깨진 것은 그 때문이다.
   *
   * 이제 손짓은 **하나의 값**이고 주인도 하나다:
   * - 겨눈 자리(`aim`)가 이 값 안에 있으므로 그리는 것도 끝내는 것도 같은 것을 읽는다.
   * - **포인터 하나의 것**이다(`pointerId`). 다른 손가락·다른 포인터가 끼어들어도 이 손짓은
   *   흔들리지 않는다 — 끼어든 이벤트 하나에 손짓이 조용히 취소되던 것이 그것이다.
   * - 시작도 상자가 받는다. 칸은 눌린 자리를 표시(`data-cell`)로만 알리고 핸들러를 갖지
   *   않는다 — 시작은 칸, 나머지는 상자로 갈라 두면 그 사이가 어긋난다.
   */
  interface Gesture {
    /** 이 손짓의 주인. 다른 포인터의 이벤트는 쳐다보지 않는다. */
    pointerId: number;
    kind: GridDragKind | 'tap';
    /** 누른 칸 — 끌지 않았으면 이 칸에 대해 행동하고, 새로 그릴 때는 네모의 한쪽 끝이다. */
    from: GridCell;
    item: T | null;
    /** 옮기기·크기 조절의 시작 자리. */
    session: GridDragSession | null;
    /** 지금 겨눈 자리 — 화면도 이것을 그리고, 끝낼 때도 이것을 쓴다. */
    aim: GridPlacement | null;
  }
  const gestureRef = useRef<Gesture | null>(null);
  /* 손짓이 바뀌면 다시 그린다 — 값은 ref 하나이고, 이것은 「바뀌었다」는 신호일 뿐이다. */
  const [, redraw] = useReducer((n: number) => n + 1, 0);

  /** 포인터가 가리키는 칸 — 격자 상자 기준 상대 좌표로 셈한다. */
  function cellFromPointer(e: { clientX: number; clientY: number }): GridCell | null {
    const el = boxRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return cellAt({ width: r.width, height: r.height, cols, rows }, e.clientX - r.left, e.clientY - r.top);
  }

  /** 이 네모가 통째로 비어 있나 — 여러 칸을 묶어 만들 때 놓을 수 있는지 판정한다. */
  function isFree(p: GridPlacement): boolean {
    if (p.col + p.colSpan > cols || p.row + p.rowSpan > rows) return false;
    for (const item of items) {
      if (item.col == null || item.row == null) continue;
      const a = { col: item.col, row: item.row, colSpan: item.colSpan ?? 1, rowSpan: item.rowSpan ?? 1 };
      const hit =
        p.col < a.col + a.colSpan && a.col < p.col + p.colSpan && p.row < a.row + a.rowSpan && a.row < p.row + p.rowSpan;
      if (hit) return false;
    }
    return true;
  }

  /**
   * 손이 있는 자리로 겨눈다 — 손이 움직였을 때도, 판이 밀렸을 때도 **같은 계산**이다.
   *
   * 옮기기·크기와 새로 그리기가 여기 함께 있다. 갈래를 나눠 두면 한쪽에만 고침이 들어간다 —
   * 실제로 새로 그리는 손짓은 가장자리 밀기를 못 받아, 화면 밖 행까지 네모를 끌 수 없었다.
   */
  function aimAt(point: { clientX: number; clientY: number }) {
    const g = gestureRef.current;
    if (!g) return;
    const target = cellFromPointer(point);
    if (!target) return;

    if (!g.session) {
      /* **네모는 빈 자리에서만 자란다.** 예전에는 남의 자리까지 덮도록 두고 빨갛게 칠한 뒤
         손을 떼면 아무 일도 하지 않았다 — 사람 눈에는 「끌었는데 반응 없이 사라졌다」다.
         막히면 그 앞에서 멈추면 그런 상태가 아예 생기지 않는다. */
      const next = {
        col: Math.min(g.from.col, target.col),
        row: Math.min(g.from.row, target.row),
        colSpan: Math.abs(target.col - g.from.col) + 1,
        rowSpan: Math.abs(target.row - g.from.row) + 1,
      };
      if (isFree(next)) { g.aim = next; redraw(); }
      return;
    }

    const placement = gridDragTo(g.session, target);
    if (!gridPlacementChanged(g.session.origin, placement) && !g.aim) return;
    g.aim = placement;
    redraw();
  }

  /**
   * 눌렀다 — 무엇을 시작하는지 정한다.
   *
   * **상자가 받는다.** 눌린 것이 칸인지 손잡이인지 빼기 단추인지는 표(`data-*`)를 보고 안다.
   * 칸마다 핸들러를 달던 때는 시작과 나머지가 다른 주인에게 있어, 캡처가 풀리거나 칸이 다시
   * 그려지는 순간 둘이 어긋났다.
   */
  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0 || gestureRef.current) return;
    const el = e.target as HTMLElement;
    /* 빼기 단추는 손짓이 아니다 — 그 단추가 제 일(누르고 떼기)을 하게 둔다. */
    if (el.closest('[data-remove]')) return;

    const cellEl = el.closest<HTMLElement>('[data-cell]');
    if (!cellEl) {
      /* 상자의 빈 곳(눈금 옆·격자 아래)을 눌렀다 — 「빈 데를 누르면 풀린다」. */
      if (selectedId != null) onDeselect?.();
      return;
    }
    const [c, r] = cellEl.dataset.cell!.split(',').map(Number);
    const from = { col: c!, row: r! };
    const item = items.find((i) => i.col === from.col && i.row === from.row) ?? null;
    const resizing = el.closest('[data-resize]') != null;
    const kind: GridDragKind | 'tap' = item ? (resizing ? 'resize' : 'move') : 'tap';

    /* 브라우저의 기본 손짓을 끈다 — 안 끄면 끌기 하나가 **글자 선택**으로도 읽혀서, 판 밖으로
       나갔다 오면 표와 패널이 파랗게 잡힌 채 돌아온다(네이티브 이미지 끌기도 같이 뜬다).
       기본 동작에는 「누른 것에 초점 주기」도 들어 있으므로 그것만 손으로 되돌린다 — 다만
       **판을 밀지 않고**(`preventScroll`): 초점을 주며 판이 스르륵 움직이면 손 아래 칸이
       바뀌어, 누른 자리와 겨눈 자리가 처음부터 어긋난다. */
    e.preventDefault();
    cellEl.focus({ preventScroll: true });

    const origin = item
      ? { col: item.col ?? 0, row: item.row ?? 0, colSpan: item.colSpan ?? 1, rowSpan: item.rowSpan ?? 1 }
      : null;
    gestureRef.current = {
      pointerId: e.pointerId,
      kind,
      from,
      item,
      session: item && origin && kind !== 'tap' ? startGridDrag(kind, item.id, origin, cellFromPointer(e) ?? from) : null,
      aim: null,
    };
    redraw();

    /* 캡처는 **격자**가 쥔다 — 칸이 쥐면 끌려간 자리에서 다른 칸이 같은 손짓을 또 받는다.
       못 쥐면 따라갈 수도 없다(그 포인터가 이미 사라졌다는 뜻이다) — 손짓을 세워 두지 않고
       그 자리에서 접는다. 안 그러면 끝을 알리는 `pointerup` 이 영영 오지 않아 화면이 굳는다. */
    try {
      boxRef.current?.setPointerCapture(e.pointerId);
    } catch {
      endGesture(false);
    }
  }


  /**
   * 끌던 것을 물린다 — 평면도의 배치 취소와 같은 어법(Esc).
   *
   * 없으면 잘못 잡았을 때 빠져나갈 길이 「원래 칸에 정확히 도로 놓기」뿐이다. 손짓이 값 하나가
   * 된 뒤로는 물리는 일도 그 값을 비우는 것 하나다.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isCancelKey(e)) return;
      if (gestureRef.current) {
        endGesture(false);
        return;
      }
      if (selectedId != null) onDeselectRef.current?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  /**
   * 손이 얹힌 칸 — **CSS `:hover` 를 쓰지 않는다.**
   *
   * 손짓이 끝나는 순간 브라우저는 `:hover` 를 다시 셈하는데, 그 기준이 **캡처를 걸기 전에
   * 손이 있던 자리**다. 그래서 끌기를 끝내면 처음 누른 칸이 한 박자 반짝였다 — 손은 벌써
   * 저쪽에 가 있는데 원래 자리가 켜진다. 우리가 이미 손의 자리를 알고 있으므로(같은
   * `pointermove` 를 받는다) 얹힘도 여기서 정한다. 손짓 중에는 비고, 끝나면 **다음으로
   * 손이 움직일 때까지** 비어 있다 — 반짝일 자리가 없다.
   */
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  /**
   * Tab 으로 닿는 칸은 **하나뿐**이다(roving tabindex) — 판은 하나의 정거장이고 그 안은
   * 화살표로 옮긴다. 손짓과는 다른 길이라 손짓 값에 섞지 않는다.
   */
  const [activeCell, setActiveCell] = useState<GridCell | null>(null);

  /** 이 이벤트가 **이 손짓의 것**인가 — 아니면 쳐다보지 않는다. */
  function mine(e: React.PointerEvent): Gesture | null {
    const g = gestureRef.current;
    return g && g.pointerId === e.pointerId ? g : null;
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = mine(e);
    if (!g) {
      /* 손짓 중이 아니면 **얹힌 칸**만 갱신한다 — 바뀔 때만(칸마다 다시 그리지 않게). */
      if (gestureRef.current) return;
      const c = cellFromPointer(e);
      const key = c ? `${c.col},${c.row}` : null;
      if (key !== hoverKey) setHoverKey(key);
      return;
    }
    if (hoverKey !== null) setHoverKey(null);
    /* **손을 우리가 못 보는 데서 뗐다.** 창 밖에서 놓거나 다른 앱으로 넘어가면 캡처가 풀려
       `pointerup` 이 오지 않는다. 그러면 손짓이 살아 있는 채로 남아, 돌아왔을 때 버튼을
       누르지도 않았는데 장비가 커서를 따라다녔다. 눌린 버튼이 없다는 사실이 그 신호다. */
    if (e.buttons === 0) {
      endGesture(false);
      return;
    }
    /* 창 밖에서는 겨누지 않는다 — 손짓은 살아 있으므로 들어오면 그 자리에서 이어진다.
       겨누면 겨눈 칸이 가장자리로 붙어(`cellAt`) 손이 없는 자리를 가리킨다. */
    if (!inWindow(e)) return;
    aimAt(e);
  }

  /** 눌러서 시작한 칸에 대한 행동 — 고르거나, 빈 자리면 채운다. */
  function tap(g: Gesture) {
    if (g.item) {
      onSelect(g.item);
      return;
    }
    /* **빈 칸을 누르는 것은 곧 채우기다.** 한때는 고른 것이 있으면 먼저 풀고 한 번 더 눌러야
       채웠다. 그런데 이 판에서 빈 칸은 「다른 데」가 아니라 **놓을 자리**다 — 장비를 고쳐 놓고
       옆 칸에 하나 더 넣으려던 손짓이 매번 삼켜졌다. 푸는 길은 따로 있다(Esc·다시 누르기). */
    onAddAtCell(g.from);
  }

  function endGesture(commit: boolean) {
    const g = gestureRef.current;
    gestureRef.current = null;
    redraw();
    if (!g) return;

    /* 그리던 네모가 여러 칸이면 그 네모에 만든다. 한 칸이면 평소대로 누른 것으로 친다.
       네모는 빈 자리에서만 자랐으므로 여기서 다시 물을 것이 없다. */
    if (!g.session) {
      const rect = g.aim;
      if (!commit) return;
      if (rect && (rect.colSpan > 1 || rect.rowSpan > 1)) onAddAtCell(rect);
      else tap(g);
      return;
    }

    /* 끈 것은 누른 것이 아니다 — 자리를 옮기려던 손짓이 상세 패널을 열면 안 된다. */
    const moved = g.aim != null && gridPlacementChanged(g.session.origin, g.aim);
    if (!moved) {
      if (commit) tap(g);
      return;
    }
    if (commit && g.aim && canPlace(g.session.assetId, g.aim)) onMove(g.session.assetId, g.aim);
  }

  /**
   * 화살표로 칸을 옮긴다 — 판 밖으로는 나가지 않는다(가장자리에서 멈춘다).
   *
   * 옮긴 자리에 **실제 단추가 없을 수 있다**: span 이 덮은 칸은 그리지 않고, 덮은 장비의
   * 시작 칸 하나만 단추다. 그래서 좌표로 찾지 않고 **그려진 단추 중 가장 가까운 것**으로
   * 간다 — 안 그러면 2칸짜리 장비 옆에서 화살표가 먹히지 않는다.
   */
  function moveActive(d: { dc?: number; dr?: number } | 'first' | 'last', fromCell: GridCell) {
    const box = boxRef.current;
    if (!box) return;
    const focusCell = (key: string) => {
      const el = box.querySelector<HTMLElement>(`button[data-cell="${key}"]`);
      if (!el) return false;
      const [c, r] = key.split(',').map(Number);
      setActiveCell({ col: c!, row: r! });
      el.focus();
      return true;
    };

    if (d === 'first' || d === 'last') {
      const els = [...box.querySelectorAll<HTMLElement>('button[data-cell]')];
      const target = d === 'first' ? els[0] : els[els.length - 1];
      if (target?.dataset.cell) focusCell(target.dataset.cell);
      return;
    }

    /* **누른 방향으로만** 간다. 「가장 가까운 칸」으로 물러서면 위를 눌렀는데 옆으로 새는
       일이 생긴다(위가 span 에 덮여 단추가 없을 때 실제로 그랬다).
       한 칸씩 밀어 보다가 **단추가 있는 칸**을 만나면 거기 선다. 덮인 칸을 만나면 그것을
       덮은 장비의 시작 칸으로 간다 — 10칸짜리 장비 위를 지날 때 그 장비에 서는 것이 맞다.
       끝까지 없으면 움직이지 않는다(가장자리에서 멈춘다). */
    const here = `${fromCell.col},${fromCell.row}`;
    let { col, row } = fromCell;
    for (;;) {
      col += d.dc ?? 0;
      row += d.dr ?? 0;
      if (col < 0 || row < 0 || col >= cols || row >= rows) return;
      const key = `${col},${row}`;
      const target = ownerOf.get(key) ?? key;
      if (target !== here && focusCell(target)) return;
    }
  }

  /** `열,행` → 그 칸에서 시작하는 것. */
  /* 그리는 것은 **손짓 값 하나에서** 나온다 — 따로 보관한 미리보기가 없으므로 어긋날 수 없다. */
  const g = gestureRef.current;
  const dragging = g != null;
  const preview = g?.session && g.aim ? { itemId: g.session.assetId, placement: g.aim, ok: canPlace(g.session.assetId, g.aim) } : null;
  const createRect = g && !g.session && g.aim ? { placement: g.aim } : null;

  const byCell = new Map<string, T>();
  /** 이미 무엇이 덮고 있는 칸 — span 이 지나가는 자리다. */
  const covered = new Set<string>();
  /** 덮인 칸 → 그것을 덮은 장비의 **시작 칸**(그 자리에만 단추가 있다). */
  const ownerOf = new Map<string, string>();
  for (const item of items) {
    if (item.col == null || item.row == null) continue;
    byCell.set(`${item.col},${item.row}`, item);
    /* 덮인 칸은 **지금 보이는 자리** 기준이다 — 끌고 있는 것은 미리보기 자리를 덮는다.
       저장된 자리로 계산하면 떠나온 자리가 빈 칸조차 없는 구멍으로 남아, 어디가 비었는지
       읽을 수 없다(정작 그 자리는 이제 놓을 수 있는 자리인데). */
    const at = preview?.itemId === item.id
      ? preview.placement
      : { col: item.col, row: item.row, colSpan: item.colSpan ?? 1, rowSpan: item.rowSpan ?? 1 };
    for (let r = 0; r < at.rowSpan; r++) {
      for (let c = 0; c < at.colSpan; c++) {
        covered.add(`${at.col + c},${at.row + r}`);
        /* 덮인 칸이 **누구의 것인지**까지 적어 둔다 — 화살표가 그 칸을 지나갈 때 그 장비의
           시작 칸(단추가 있는 자리)으로 가야 한다. */
        ownerOf.set(`${at.col + c},${at.row + r}`, `${at.col},${at.row}`);
      }
    }
  }

  /* 아직 아무도 짚지 않았고 고른 것도 없을 때 Tab 이 닿을 칸 — 그려지는 첫 칸이다
     (`0,0` 을 못 박으면 그 자리가 span 에 덮여 단추가 없을 때 정거장이 사라진다). */
  let firstCellKey: string | null = null;
  for (let row = 0; row < rows && firstCellKey === null; row++) {
    for (let col = 0; col < cols; col++) {
      const k = `${col},${row}`;
      if (byCell.has(k) || !covered.has(k)) { firstCellKey = k; break; }
    }
  }

  /* 덮인 칸에 손이 얹혔으면 그 자리에 선 장비가 얹힌 것이다(단추는 시작 칸에만 있다). */
  const hoveredCell = hoverKey ? ownerOf.get(hoverKey) ?? hoverKey : null;

  const cells: ReactNode[] = [];
  /* 놓을 자리의 네모 — 끄는 동안에는 손을 따라가고(`createRect`), 손을 뗀 뒤 무엇을 넣을지
     묻는 동안에는 **그 자리에 남는다**(`pending`). 확정하거나 물릴 때 사라진다. */
  const rectShown = createRect
    ? { placement: createRect.placement, text: `${createRect.placement.colSpan}×${createRect.placement.rowSpan}` }
    : pending
      ? { placement: pending.at, text: pending.label }
      : null;
  if (rectShown) {
    const { col, row, colSpan, rowSpan } = rectShown.placement;
    cells.push(
      <li
        key="create-preview"
        className="pointer-events-none"
        style={{ gridColumn: `${col + 1} / span ${colSpan}`, gridRow: `${row + 1} / span ${rowSpan}`, zIndex: 12 }}
      >
        <div
          className={cn(
            'flex h-full w-full items-center justify-center rounded border-2 text-xs font-medium',
            'border-primary bg-info-bg text-primary',
          )}
        >
          {/* 좁은 자리에는 글자를 넣지 않는다 — 한 칸(28px)에 「새 자산」을 욱여넣으면
              「새…」가 되어 아무 말도 못 한다. 그때는 물든 네모 자체가 「여기」라고 말한다
              (칸 안 이름이 좁을 때 눕히거나 접는 것과 같은 판단, `LABEL_MIN_W`). */}
          {colWidth > 0 && colSpan * colWidth >= LABEL_MIN_W && (
            <span className="truncate px-1">{rectShown.text}</span>
          )}
        </div>
      </li>,
    );
  }
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
      const vertical = colWidth > 0 && cellW < LABEL_MIN_W && at.rowSpan * rowHeight > cellW;
      const tone = item ? toneOf?.(item) ?? null : null;

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
              'group relative flex h-full w-full select-none items-center justify-center overflow-hidden rounded px-1 text-center text-xs',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              // 꽂혀 있는 것만 칸으로 보인다 — 빈 자리는 배경 그대로 둔다.
              item
                ? cn(
                    'cursor-pointer select-none border border-line bg-surface text-content transition-colors',
                    !dragging && hoveredCell === key && selectedId !== item.id && 'bg-surface-3',
                  )
                /* 빈 자리는 배경 그대로 두되, 손이 얹히면 **놓을 자리로 보이게** 한다.
                   여기 `+` 글자를 띄우지 않는다: 손짓이 끝나는 순간 커서 아래 칸은 잠깐
                   빈 칸이므로(만든 것이 아직 안 왔다) 그 한 프레임에 `+` 가 번쩍인다.
                   테두리와 바탕이 이미 「누를 수 있는 자리」라고 말하므로 글자는 군더더기다. */
                : cn(
                    'cursor-pointer select-none border border-dashed border-line/50 text-content-faint transition-colors',
                    /* 손짓이 벌어지는 동안 빈 칸은 **손을 반기지 않는다** — 지금 하는 일은
                       옮기기이지 추가가 아니다. */
                    !dragging && hoveredCell === key && 'border-solid border-primary bg-info-bg text-primary',
                  ),
              item && 'cursor-grab touch-none active:cursor-grabbing',
              item && selectedId === item.id && 'ring-2 ring-inset ring-primary',
              // 놓을 수 없는 자리면 그렇다고 말한다 — 놓아 봐야 되돌아가는 것보다 낫다.
              pv && (pv.ok ? 'ring-2 ring-primary' : 'ring-2 ring-danger opacity-70'),
            )}
            title={
              item
                ? `${item.name} · ${cellLabel(at.col, at.row)}`
                : `${cellLabel(col, row)} (비어 있음)`
            }
            /* `title` 은 마우스를 얹어야 뜬다 — 읽어 주는 이름은 따로 준다. 칸 안의 글씨는
               좁으면 잘리고 세로로 눕기까지 하므로 그것만으로는 무엇인지 알 수 없다. */
            aria-label={
              item
                ? `${item.name}, ${cellLabel(at.col, at.row)}`
                : `${cellLabel(col, row)}, 비어 있음. 눌러서 추가`
            }
            /* 손짓은 **상자가 통째로** 받는다 — 칸은 눌린 자리를 `data-cell` 로만 알린다.
               키보드는 아래 `onKeyDown` 이 맡는다(손짓과 다른 길이라 섞이지 않는다). */
            /* 판은 **하나의 정거장**이고 그 안은 화살표로 옮긴다(roving tabindex).
               196칸이 모두 Tab 순서에 들어가면 키보드로는 이 판을 지나갈 수가 없다. */
            data-cell={`${col},${row}`}
            tabIndex={
              (activeCell
                ? activeCell.col === col && activeCell.row === row
                : selectedId && item
                  ? selectedId === item.id
                  : firstCellKey === key)
                ? 0
                : -1
            }
            onFocus={() => setActiveCell({ col, row })}
            /* 키보드도 **같은 판정**을 거친다(`tap`). 예전에는 여기서 규칙을 다시 써서,
               빈 칸을 눌러 고른 것을 푸는 거동이 손짓에만 있고 키보드에는 없었다. */
            onKeyDown={(e) => {
              const move: Record<string, { dc?: number; dr?: number }> = {
                ArrowRight: { dc: 1 }, ArrowLeft: { dc: -1 }, ArrowDown: { dr: 1 }, ArrowUp: { dr: -1 },
              };
              if (move[e.key]) {
                e.preventDefault();
                moveActive(move[e.key]!, { col, row });
                return;
              }
              if (e.key === 'Home' || e.key === 'End') {
                e.preventDefault();
                moveActive(e.key === 'Home' ? 'first' : 'last', { col, row });
                return;
              }
              /* 뺄 수 있는 것은 **키보드로도** 뺀다 — 빼기 단추는 손이 얹혀야 나타나므로
                 그것만으로는 키보드로 닿는 길이 없다(현황표·트리의 Delete 와 같은 어법). */
              if ((e.key === 'Delete' || e.key === 'Backspace') && item && onRemove) {
                e.preventDefault();
                onRemove(item);
                return;
              }
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              tap({ pointerId: -1, kind: 'tap', item: item ?? null, from: { col, row }, session: null, aim: null });
            }}
          >
            {/* 번호는 칸이 아니라 왼쪽 눈금이 맡는다 — 칸마다 번호를 박으면 4열 12행에서 번호가
                48개 흩어지고, 정작 장비가 놓인 칸은 이름과 번호가 자리를 다툰다.
                랙 정면도의 어법대로 「몇 단」은 눈금이, 「무엇인가」는 칸이 말한다. */}
            {item ? (
              /* 한 칸짜리에는 이름만 — 두 줄을 욱여넣으면 둘 다 못 읽는다. 전체 이름은 툴팁에 있다. */
              <span
                className={cn(
                  'flex min-h-0 min-w-0 max-h-full max-w-full items-center leading-tight',
                  /* 세로로 세운 글씨는 칸 높이가 곧 글자 수다. 한때 10px 로 줄였는데, 그건
                     격자 높이가 행당 30px 로 못 박혀 있을 때의 이야기다 — 이제 격자가 상자를
                     채우므로(`fill`) 칸이 그때보다 높아 규칙 크기로 들어간다.
                     전체 이름은 툴팁·읽어주기에 있다. */
                  vertical ? 'flex-row text-xs' : 'flex-col',
                )}
                /* `text-orientation: upright` — 기본값(`mixed`)은 영문·숫자를 눕혀서
                   「광단말 A」의 A 만 옆으로 누웠다. 실물 카드 라벨의 짧은 영숫자 꼬리표는
                   세워서 인쇄된다. */
                style={vertical ? { writingMode: 'vertical-rl', textOrientation: 'upright' } : undefined}
              >
                <span className="min-h-0 min-w-0 max-h-full max-w-full truncate">{item.name}</span>
                {at.rowSpan > 1 && !vertical && trailing?.(item)}
              </span>
            ) : (
              /* 빈 자리의 `+` — **여기 눌러서 넣는다**는 말이다. 얹힘을 우리가 알므로
                 손짓이 끝난 자리에서 되살아나지 않는다. */
              <span
                className={cn(
                  'text-base leading-none text-primary transition-opacity',
                  /* **얹혔을 때만**이다. 초점에도 켜면 끌기를 끝낸 자리에 초점이 남아 있으므로
                     그 칸이 켜진 채로 남는다 — 「처음 누른 자리가 반짝인다」가 그것이었다.
                     초점은 테두리(`focus-visible`)가 말한다. */
                  !dragging && hoveredCell === key ? 'opacity-100' : 'opacity-0',
                )}
              >
                +
              </span>
            )}
            {/* 운전 상태 표시등 — **왼쪽 위** 모서리.
                오른쪽 위는 행동(빼기)의 자리다 — 버튼은 관례대로 오른쪽 위에 둔다.
                판을 훑는 사람이 먼저 보는 것은 「어느 게 죽었나」다. 이름을 한 줄씩 읽어
                내려가지 않고 색만으로 훑을 수 있어야 하므로 글자와 자리를 다투지 않는
                모서리에 둔다 — 랙 실물의 상태 LED 도 전면 모서리에 있다.
                색은 상태 어휘가 정한다(`assetStatusTone`). 여기서 고르지 않는다. */}
            {tone && (
              <span
                aria-hidden
                className={cn(
                  /* 8px 로 족하다 — 안 보이던 원인은 크기가 아니라 색이었다(글자용 상태색은
                     셋의 명도가 비슷해 뭉쳤다). 키우면 좁은 칸에서 글씨와 자리를 다툰다.
                     옅은 테: 흰 카드 위의 노랑은 테가 없으면 경계가 번져 색이 흐려 보인다.
                     `absolute` 라 글의 가운데 정렬에는 관여하지 않는다. */
                  'pointer-events-none absolute left-1 top-1 h-2 w-2 rounded-full',
                  'ring-1 ring-content-faint/60',
                  LAMP[tone],
                )}
              />
            )}

            {/* 빼기 — 오른쪽 위. 예전에는 고른 뒤 오른쪽 패널까지 가서 눌러야 했다.
                손잡이와 같은 규칙으로 드러난다: 평소에는 숨고, 얹으면·고르면 보인다
                (조직 트리·케이블 품목 목록과 같은 어법). */}
            {item && onRemove && (
              <span
                role="button"
                tabIndex={-1}
                aria-label={`${item.name} 빼기`}
                title="구성에서 빼기"
                className={cn(
                  'absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded',
                  'text-content-faint transition-opacity hover:bg-danger-bg hover:text-danger',
                  hoveredCell === key || selectedId === item.id ? 'opacity-100' : 'opacity-0',
                )}
                /* 손짓이 아니라 단추다 — 상자가 이 표를 보고 비켜 준다(`data-remove`).
                   **누르는 순간 지우지 않는다**: 잘못 눌렀으면 손가락을 밖으로 빼서 물릴 수
                   있어야 한다(단추의 기본 규칙). */
                data-remove
                onClick={() => onRemove(item)}
              >
                <X size={12} />
              </span>
            )}

            {/* 크기 손잡이 — 오른쪽 아래 모서리. **두 축 모두** 늘어난다(왼쪽 위 고정).
                예전에는 아래 변에만 있어서 세로로밖에 못 늘렸고, 그래서 판이 슬롯처럼 굳었다. */}
            {item && (
              <span
                role="separator"
                aria-label={`${item.name} 크기 조절`}
                className={cn(
                  'absolute bottom-0 right-0 h-2.5 w-2.5 cursor-nwse-resize touch-none transition-opacity',
                  // 터치에는 얹힘이 없다 — 고른 것에는 늘 보인다.
                  hoveredCell === key || selectedId === item.id ? 'opacity-100' : 'opacity-0',
                )}
                /* 손잡이를 잡은 것은 옮기려는 것이 아니다 — 상자가 이 표를 보고 크기 조절로
                   읽는다(`data-resize`). 핸들러를 따로 달면 시작만 다른 주인에게 간다. */
                data-resize
              >
                <span className="block h-full w-full rounded-br bg-primary/50" />
              </span>
            )}
          </button>
        </li>,
      );
    }
  }

  /* 행 나누기.
     - `fill`(캔버스로 세울 때): **상자에 맞춘다**. 스크롤을 만들지 않는다 — 랙 정면도는
       한눈에 들어와야 하는 그림이라, 스무 행을 보려고 판을 내리는 순간 「어디에 뭐가
       있나」를 잃는다. 행이 적으면 늘고 많으면 줄어들되 상자는 늘 꽉 찬다.
     - 고정 px 상자(상세 패널): 최소 높이를 지키고 넘치면 스크롤한다 — 좁은 패널에서
       칸이 12px 로 줄면 누를 수가 없다.
     드래그 좌표는 상자 크기 대비 **비율**로 셈하므로(`cellAt`) 행 높이가 달라져도 맞는다. */
  const rowRule = {
    gridTemplateRows: fill
      ? `repeat(${rows}, minmax(0, 1fr))`
      : `repeat(${rows}, minmax(${GRID_ROW_H}px, 1fr))`,
  };

  return (
    /* 세로 스크롤은 **눈금과 칸을 함께** 감싼 이 상자가 쥔다 — 눈금만 따로 두면 판을
       내렸을 때 단 번호가 어긋난다. 눈금과 격자는 함께 늘어난다(기본 `stretch`). */
    <InsetBox
      className={cn(
        'mt-1 flex gap-1 p-1.5 shadow-inner',
        // 캔버스로 세우면 스크롤이 없다 — 격자를 상자에 맞춘다.
        fill ? 'min-h-0 flex-1 overflow-hidden' : 'overflow-y-auto',
      )}
      style={boxHeight != null ? { height: boxHeight } : undefined}
      /* 상자의 **제 여백**(눈금 옆·격자 아래)을 누르면 푼다 — 「빈 데를 누르면 풀린다」.
         손짓이 아니라 그 규칙이라 격자의 손짓 배선과 섞지 않는다(격자 안은 격자가 받는다). */
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && selectedId != null) onDeselect?.();
      }}
    >
      {/* 단 눈금 — 랙 정면도의 U 눈금과 같다. 「몇 단인가」를 판 옆에서 한 번에 읽는다.
          격자 바깥에 두는 이유: 포인터 좌표를 칸으로 셈하는 상자(`boxRef`)에 섞이면
          눈금 폭만큼 칸 계산이 밀린다. */}
      <ol
        aria-hidden
        className="grid shrink-0 gap-0.5 text-right text-xs tabular-nums text-content-faint"
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
        {/* 손짓의 이동·끝냄은 여기서 한 번만 받는다 — 캡처도 이 상자가 쥔다. */}
        <ul
          ref={boxRef}
          /* `h-full` 이 있어야 `1fr` 행이 기준을 갖는다 — 높이가 auto 면 `1fr` 은 내용
             높이(최소치)로 접힌다. 행이 많아 넘치면 이 격자가 상자보다 커지고 상자가 스크롤한다. */
          /* 끌기는 글자를 잡지 않는다 — 칸 안 이름이 잡힌 채로 끌리면 판이 파래진다.
             `touch-none`: 이 판에서 끄는 것은 **우리 손짓**이지 화면 굴리기가 아니다. 안 걸면
             트랙패드·터치에서 브라우저가 도중에 스크롤로 가져가 버리고(`pointercancel`),
             그때 손짓은 아무 말 없이 사라진다 — 「가끔 드래그가 안 먹는다」가 그것이다. */
          className="grid h-full touch-none select-none gap-0.5"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHoverKey(null)}
          onPointerUp={(e) => { if (mine(e)) endGesture(inWindow(e)); }}
          onPointerCancel={(e) => { if (mine(e)) endGesture(false); }}
          /* 캡처가 풀리면 그 손짓은 끝난 것이다 — 화면이 다시 그려져 상자가 갈리거나 브라우저가
             가져갈 수 있다. 남겨 두면 미리보기만 붙박여 있고 손짓은 죽어 있는 상태가 된다. */
          onLostPointerCapture={() => { if (gestureRef.current) endGesture(false); }}
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            minWidth: cols * GRID_COL_MIN,
            ...rowRule,
          }}
        >
          {cells}
        </ul>
      </div>
    </InsetBox>
  );
}
