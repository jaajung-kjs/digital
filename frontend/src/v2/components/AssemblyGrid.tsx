import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { type Grid, cellLabel } from '@twin/core';
import { cn, SELECTABLE, type BadgeStatus, isCancelKey, InsetBox } from '../../components/ui';
import {
  cellAt, edgeScroll, gridDragTo, gridPlacementChanged, scrollableAncestor, startGridDrag,
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
const EDGE = { margin: 28, maxSpeed: 12 };

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
   * 지금 벌어지고 있는 제스처 — **격자 하나가 소유한다**.
   *
   * 예전에는 칸마다 pointer 핸들러가 붙고 그 위에 `onClick` 이 따로 있었다. 그래서 한 번의
   * 손짓이 두 번 해석됐다: 크기 손잡이의 pointerup 이 버튼으로 버블링해 세션이 이미 지워진
   * 채로 「그냥 누른 것」으로 읽혀 상세 패널로 튀었고, 포인터 캡처가 풀리면 click 이 엉뚱한
   * 빈 칸에서 나 자산 추가 모달이 열렸다.
   *
   * 손짓의 시작(pointerdown)은 칸이 알리지만, 그 뒤의 이동·끝냄은 격자가 받는다. 끝날 때
   * **누른 것이었나 끈 것이었나**를 한 곳에서 판정하므로 두 번 해석될 자리가 없다.
   */
  interface Gesture {
    /** `tap` = 끌 수 없는 것을 눌렀다(빈 칸). */
    kind: GridDragKind | 'tap';
    /** 눌러서 시작한 칸 — 끌지 않았으면 이 칸에 대해 행동한다. */
    cell: GridCell;
    item: T | null;
    session: GridDragSession | null;
  }
  const gestureRef = useRef<Gesture | null>(null);
  /**
   * **손짓이 벌어지고 있는가** — 누른 순간부터 뗄 때까지.
   *
   * 예전에는 「미리보기가 생겼는가」로 알았는데, 미리보기는 손이 **다음 칸에 닿아야** 생긴다.
   * 그 사이(누르고 아직 한 칸도 못 간 동안) 빈 칸은 여전히 손을 반겨 `+` 를 켰다 —
   * 끌 때마다 `+` 가 반짝인 것이 그것이다. 벌어지는 일은 ref 가 알지만 화면은 상태로만
   * 다시 그려지므로, 같은 사실을 둘이 나눠 갖는다.
   */
  const [dragging, setDragging] = useState(false);
  /**
   * 끌고 있는 동안의 미리보기 — 놓기 전에는 저장하지 않는다.
   *
   * **손짓이 끝날 때 읽는 값은 상태가 아니라 ref 다.** 상태로 읽으면 마지막 `pointermove` 와
   * `pointerup` 이 한 작업 안에 몰려 들어왔을 때(빠른 손짓·좌표 합쳐짐) 아직 반영되지 않은
   * 값을 보고, 끌어 놓은 자리가 조용히 버려진다. 평면도 캔버스가 이미 같은 이유로 드래그
   * 좌표를 ref 에 둔다(`drawRef`·`movePreviewRef`).
   */
  const [preview, setPreviewState] = useState<{ itemId: string; placement: GridPlacement; ok: boolean } | null>(null);
  const previewRef = useRef<{ itemId: string; placement: GridPlacement; ok: boolean } | null>(null);
  const setPreview = (v: { itemId: string; placement: GridPlacement; ok: boolean } | null) => {
    previewRef.current = v;
    setPreviewState(v);
  };
  /**
   * 빈 칸에서 끌어 **여러 칸을 묶어** 만드는 중.
   *
   * 예전에는 한 칸에만 만들 수 있어서, 2×3 짜리 장비를 놓으려면 일단 한 칸에 만든 뒤 크기
   * 손잡이로 늘려야 했다. 놓을 자리를 눈으로 정하는 판에서 그건 두 번 일하는 것이다.
   */
  const [createRect, setCreateRectState] = useState<{ placement: GridPlacement } | null>(null);
  const createRectRef = useRef<{ placement: GridPlacement } | null>(null);
  const setCreateRect = (v: { placement: GridPlacement } | null) => {
    createRectRef.current = v;
    setCreateRectState(v);
  };

  /** 포인터가 가리키는 칸 — 격자 상자 기준 상대 좌표로 셈한다. */
  function cellFromPointer(e: { clientX: number; clientY: number }): GridCell | null {
    const el = boxRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return cellAt({ width: r.width, height: r.height, cols, rows }, e.clientX - r.left, e.clientY - r.top);
  }

  /** 눌렀을 때 — 무엇을 시작하는지만 정하고, 그 뒤는 격자가 받는다. */
  function beginGesture(kind: GridDragKind | 'tap', item: T | null, cell: GridCell, e: React.PointerEvent) {
    if (e.button !== 0) return;
    /* 브라우저의 기본 손짓을 끈다 — 안 끄면 끌기 하나가 **글자 선택**으로도 읽혀서, 판 밖으로
       나갔다 오면 표와 패널이 파랗게 잡힌 채 돌아온다(네이티브 이미지 끌기도 같이 뜬다).
       기본 동작에는 「누른 것에 초점 주기」도 들어 있으므로 그것만 손으로 되돌린다 — 키보드로
       칸을 옮겨 다니는 길(`onKeyDown`)이 초점 위에 서 있다. */
    e.preventDefault();
    (e.currentTarget as HTMLElement).closest<HTMLElement>('button')?.focus();
    const session =
      item && kind !== 'tap'
        ? startGridDrag(
            kind,
            item.id,
            { col: item.col ?? 0, row: item.row ?? 0, colSpan: item.colSpan ?? 1, rowSpan: item.rowSpan ?? 1 },
            cellFromPointer(e) ?? cell,
          )
        : null;
    gestureRef.current = { kind, cell, item, session };
    setDragging(true);
    /* 밀 상자는 **손짓 종류와 무관하게** 찾는다 — 새로 그리는 손짓도 화면 밖 행까지 가야 한다. */
    scrollersRef.current = {
      y: scrollableAncestor(boxRef.current, 'y'),
      x: scrollableAncestor(boxRef.current, 'x'),
    };
    /* 캡처는 **격자**가 쥔다 — 칸이 쥐면 끌려간 자리에서 다른 칸이 같은 손짓을 또 받는다.
       못 쥐면 따라갈 수도 없다(그 포인터가 이미 사라졌다는 뜻이다) — 손짓을 세워 두지 않고
       그 자리에서 접는다. 안 그러면 끝을 알리는 `pointerup` 이 영영 오지 않아, 화면이
       「끄는 중」인 채로 굳는다. */
    try {
      boxRef.current?.setPointerCapture(e.pointerId);
    } catch {
      endGesture(false);
    }
  }

  /**
   * 손이 있는 자리로 겨눈다 — **손이 움직였을 때도, 판이 밀렸을 때도 같은 계산**이다.
   *
   * 옮기기·크기와 새로 그리기가 여기 함께 있다. 갈래를 나눠 두면 한쪽에만 고침이 들어간다 —
   * 실제로 새로 그리는 손짓은 가장자리 밀기를 못 받아, 화면 밖 행까지 네모를 끌 수 없었다.
   */
  function aimAt(point: { clientX: number; clientY: number }) {
    const g = gestureRef.current;
    if (!g) return;
    const target = cellFromPointer(point);
    if (!target) return;

    /**
     * 빈 칸에서 시작했다 — 시작 칸과 지금 칸이 이루는 네모다.
     *
     * **네모는 빈 자리에서만 자란다.** 예전에는 남의 자리까지 덮도록 두고 빨갛게 칠한 뒤,
     * 손을 떼면 아무 일도 하지 않았다 — 사람 눈에는 「끌었는데 아무 반응 없이 사라졌다」다.
     * 무엇이 잘못인지 말할 자리도 없다(그리는 중에만 빨갰다). 아예 덮지 못하게 하면 그 상태가
     * 생기지 않는다: 막히면 그 자리에서 자라기를 멈추므로, 어디까지 되는지가 끄는 동안 보인다.
     */
    if (!g.session) {
      const placement = {
        col: Math.min(g.cell.col, target.col),
        row: Math.min(g.cell.row, target.row),
        colSpan: Math.abs(target.col - g.cell.col) + 1,
        rowSpan: Math.abs(target.row - g.cell.row) + 1,
      };
      /* 시작 칸은 비어 있었으므로 물러설 자리는 늘 있다(못해도 그 한 칸). */
      if (isFree(placement)) setCreateRect({ placement });
      else if (!createRectRef.current) setCreateRect({ placement: { ...g.cell, colSpan: 1, rowSpan: 1 } });
      return;
    }

    const session = g.session;
    const placement = gridDragTo(session, target);
    session.moved = session.moved || gridPlacementChanged(session.origin, placement);
    if (!session.moved) return;
    setPreview({ itemId: session.assetId, placement, ok: canPlace(session.assetId, placement) });
  }

  /**
   * Tab 으로 닿는 칸은 **하나뿐**이다(roving tabindex).
   *
   * 예전에는 칸마다 `tabIndex=0` 이라, 키보드로 이 판을 지나가려면 Tab 을 **196번** 눌러야
   * 했다(10×20 에서 빈 칸까지 전부 단추다). 판은 하나의 정거장이고 그 안은 화살표로
   * 옮긴다 — WAI-ARIA 가 격자·트리에 정한 규약이고, 조직 트리가 이미 그렇게 움직인다.
   *
   * 어느 칸이 그 하나인가: 사람이 마지막으로 짚은 칸 → 고른 장비가 놓인 칸 → 첫 칸.
   */
  const [activeCell, setActiveCell] = useState<GridCell | null>(null);

  /** 마지막으로 손이 있던 자리 — 판이 밀리는 동안에는 이 점이 기준이다. */
  const pointRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  /** 밀 상자 — 손짓을 시작할 때 한 번만 찾는다(매 프레임 조상을 훑으면 스타일 재계산이 는다). */
  const scrollersRef = useRef<{ x: Element | null; y: Element | null }>({ x: null, y: null });

  /**
   * 가장자리에 손이 닿아 있는 동안 판을 민다.
   *
   * 20단짜리 판은 좁은 상세 패널에 다 들어가지 않는다. 밀어 주지 않으면 화면 밖 자리로는
   * 아예 끌어다 놓을 수 없다 — 손을 떼면 그 자리에 놓여 버리므로 「끌다 말고 스크롤」도
   * 못 한다. 밀고 난 뒤에는 같은 손 자리가 다른 칸을 가리키므로 미리보기를 다시 맞춘다.
   */
  function pump() {
    rafRef.current = null;
    const point = pointRef.current;
    if (!gestureRef.current || !point) return;

    // 세로·가로가 다른 상자일 수 있다(상세 패널의 세로 상자 안에 격자의 가로 상자).
    const p = { x: point.clientX, y: point.clientY };
    const { x, y } = scrollersRef.current;
    const dy = y ? edgeScroll(y.getBoundingClientRect(), p, EDGE).dy : 0;
    const dx = x ? edgeScroll(x.getBoundingClientRect(), p, EDGE).dx : 0;
    if (dy) y!.scrollTop += dy;
    if (dx) x!.scrollLeft += dx;
    /* 밀리지 않았으면 겨눈 칸도 그대로다 — 매 프레임 다시 맞추면 화면만 다시 그린다.
       (손이 움직였을 때는 `onPointerMove` 가 이미 맞춘다.) */
    if (dx || dy) aimAt(point);
    rafRef.current = requestAnimationFrame(pump);
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = gestureRef.current;
    if (!g) return;
    /* **손을 우리가 못 보는 데서 뗐다.** 창 밖에서 놓거나 다른 앱으로 넘어가면 캡처가 풀려
       `pointerup` 이 오지 않는다. 그러면 손짓이 살아 있는 채로 남아, 돌아왔을 때 버튼을
       누르지도 않았는데 장비가 커서를 따라다녔다 — 손을 뗀 자리가 어디였는지 알 수 없으므로
       **물린다**(`pointercancel` 과 같은 뜻이다). 눌린 버튼이 없다는 사실이 그 신호다. */
    if (e.buttons === 0) {
      endGesture(false);
      return;
    }
    /* 창 밖에서는 겨누지 않는다 — 손짓은 살아 있으므로 들어오면 그 자리에서 이어진다.
       겨누기를 이어 가면 겨눈 칸이 가장자리로 붙고(`cellAt`) 가장자리 밀기가 최대 속도로
       계속 굴러, 손을 다시 들여놓으면 장비가 저 멀리 가 있다. */
    if (!inWindow(e)) {
      stopPump();
      return;
    }
    pointRef.current = { clientX: e.clientX, clientY: e.clientY };
    aimAt(e);
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(pump);
  }

  function stopPump() {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    pointRef.current = null;
    scrollersRef.current = { x: null, y: null };
  }
  // 끌던 중에 화면이 사라져도 루프는 멈춰야 한다.
  useEffect(() => stopPump, []);

  /**
   * 끌던 것을 물린다 — 평면도의 배치 취소와 같은 어법(ESC).
   *
   * 없으면 잘못 잡았을 때 빠져나갈 길이 「원래 칸에 정확히 도로 놓기」뿐이다. 겹치는 자리에서
   * 손을 떼면 아무 일도 안 일어나긴 하지만, 그것을 알 수가 없어 손이 굳는다.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isCancelKey(e)) return;
      // 끌고 있으면 그 손짓을 물린다. 아니면 고른 것을 푼다 — Esc 는 「지금 것을 취소」다.
      if (gestureRef.current) {
        gestureRef.current = null;
        setDragging(false);
        stopPump();
        setPreview(null);
        setCreateRect(null);
        return;
      }
      if (selectedId != null) onDeselectRef.current?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

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

  /** 눌러서 시작한 칸에 대한 행동 — 고르거나, 빈 자리면 (고른 것을 풀거나) 채운다. */
  function tap(gesture: Gesture) {
    if (gesture.item) {
      onSelect(gesture.item);
      return;
    }
    /* **빈 칸을 누르는 것은 곧 채우기다.**
       한때는 고른 것이 있으면 먼저 풀고, 한 번 더 눌러야 채웠다(「다른 데를 누르면 풀린다」를
       빈 칸에도 적용). 그런데 이 판에서 빈 칸은 「다른 데」가 아니라 **놓을 자리**다 — 장비를
       고쳐 놓고 옆 칸에 하나 더 넣으려던 손짓이 매번 삼켜져, 설비 편집기에서는 「드래그가
       가끔만 먹는다」로 나타났다(고른 것을 지운 뒤의 첫 시도만 성공한다).
       푸는 길은 따로 있다: Esc, 고른 장비를 다시 누르기, 상세의 「설비 정보」. */
    onAddAtCell(gesture.cell);
  }

  function endGesture(commit: boolean) {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    setDragging(false);
    stopPump();
    /* 상태가 아니라 ref — 위 `setPreview`/`setCreateRect` 주석 참고. */
    const pv = previewRef.current;
    const rect = createRectRef.current;
    setPreview(null);
    setCreateRect(null);
    if (!gesture) return;

    /* 여러 칸을 묶어 끌었다 — 그 네모에 만든다. 한 칸이면 평소대로 누른 것으로 친다.
       네모는 빈 자리에서만 자랐으므로 여기서 다시 물을 것이 없다. */
    if (rect && (rect.placement.colSpan > 1 || rect.placement.rowSpan > 1)) {
      if (commit) onAddAtCell(rect.placement);
      return;
    }

    const session = gesture.session;
    /* 끈 것은 누른 것이 아니다 — 자리를 옮기려던 손짓이 상세 패널을 열거나 추가 모달을
       띄우면 안 된다. 판정이 여기 한 곳뿐이라 두 번 해석될 자리가 없다. */
    if (session?.moved) {
      if (commit && pv?.ok && gridPlacementChanged(session.origin, pv.placement)) {
        onMove(session.assetId, pv.placement);
      }
      return;
    }
    if (commit) tap(gesture);
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
              // 꽂혀 있는 것만 칸으로 보인다 — 빈 자리는 배경 그대로 둔다.
              item
                ? cn('border border-line bg-surface text-content', SELECTABLE)
                /* 빈 자리는 배경 그대로 두되, 손이 얹히면 **놓을 자리로 보이게** 한다 —
                   예전에는 `+` 만 나타나서 어디까지가 그 칸인지 읽히지 않았다. */
                : cn(
                    'border border-dashed border-line/50 text-content-faint',
                    /* 손짓이 벌어지는 동안 빈 칸은 **손을 반기지 않는다** — 지금 하는 일은
                       옮기기이지 추가가 아니다. 예전에는 `pointer-events-none` 으로 칸을
                       통째로 죽였는데, 그러면 그 칸이 겨냥 대상에서도 빠져 손짓 판정이
                       DOM 모양에 딸려 갔다. 켜고 끄는 것은 **보이는 것**뿐이다. */
                    !dragging &&
                      cn(
                        'transition-colors hover:border-solid hover:border-primary hover:bg-info-bg hover:text-primary',
                        SELECTABLE,
                      ),
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
            /* 누름만 알린다 — 이동·끝냄은 격자가 받는다(한 손짓이 두 번 해석되지 않게).
               `onClick` 은 두지 않는다: 끈 뒤에도 click 이 뒤따라 나서 상세 패널이 열렸다.
               키보드는 아래 `onKeyDown` 이 맡는다 — 손짓과 다른 길이라 섞이지 않는다. */
            onPointerDown={(e) => beginGesture(item ? 'move' : 'tap', item ?? null, { col, row }, e)}
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
              tap({ kind: 'tap', item: item ?? null, cell: { col, row }, session: null });
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
              <span className="text-base leading-none text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
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
                  'opacity-0 group-hover:opacity-100',
                  selectedId === item.id && 'opacity-100',
                )}
                /* 칸의 손짓(이동)을 가로챈다 — 지우려고 누른 것이 끌기로 읽히면 안 된다.
                   다만 **누르는 순간 지우지는 않는다**: 손을 뗄 때 지운다(그래야 잘못 눌렀을 때
                   손가락을 밖으로 빼서 물릴 수 있다 — 단추의 기본 규칙이다). */
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(item);
                }}
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
                  'opacity-0 group-hover:opacity-100',
                  // 터치에는 hover 가 없다 — 고른 것에는 늘 보인다.
                  selectedId === item.id && 'opacity-100',
                )}
                onPointerDown={(e) => {
                  // 손잡이를 잡은 것은 옮기려는 것이 아니다 — 칸의 '이동' 시작을 가로챈다.
                  e.stopPropagation();
                  beginGesture('resize', item, { col: at.col, row: at.row }, e);
                }}
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
      /* 상자의 빈 곳(격자 바깥 여백)을 누르면 푼다 — 「빈 데를 누르면 풀린다」는 판에서
         가장 흔한 손짓이다. 칸 위에서 시작한 손짓은 칸이 먼저 받으므로 여기 오지 않는다. */
      onPointerDown={(e) => {
        // 상자의 여백(눈금 옆·격자 아래)을 눌렀을 때. 칸 위에서 시작한 손짓은 칸이 받는다.
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
          /* 끌기는 글자를 잡지 않는다 — 칸 안 이름이 잡힌 채로 끌리면 판이 파래진다. */
          className="grid h-full select-none gap-0.5"
          onPointerMove={onPointerMove}
          onPointerUp={(e) => endGesture(inWindow(e))}
          onPointerCancel={() => endGesture(false)}
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
