import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject, type TdHTMLAttributes, type ThHTMLAttributes } from 'react';
import { ChevronDown, ChevronsUpDown, ChevronUp } from 'lucide-react';
import { cn } from './cn';

/**
 * 데이터 표의 껍데기 — 현황·선번장·계통이 같은 테두리·배경·열 폭 규칙을 쓰도록 하는 단일 지점.
 *
 * 열 폭은 **비율(%)** 로만 준다. 고정 폭(`w-36` 등)을 쓰면 `table-fixed` 가 그 합을 표의
 * 최소 폭으로 강제해서, 상세 패널이 열리거나 화면이 좁아지면 표가 패널 밖으로 밀려난다
 * (실제로 1280px 에서 표가 화면 오른쪽 밖으로 145px 나갔다). 비율은 남는 폭을 나눠 갖고,
 * 좁아지면 같이 줄어든다 — 잘리는 내용은 셀의 `truncate` 가 말줄임으로 처리한다.
 *
 * 모서리를 다듬는 데 `overflow-clip` 을 쓴다. `overflow-hidden` 은 **스크롤 상자**를 만들어서
 * ① 넘치는 행을 스크롤 없이 잘라 내고 ② `position: sticky` 머리글이 그 상자에 갇혀 고정되지
 * 않는다(현황표가 21건 중 17행만 보이고 스크롤바도 없었다). `clip` 은 스크롤 상자를 만들지
 * 않아 스크롤은 바깥 컨테이너가 맡는다.
 */
/**
 * 표 본문 한 줄의 **높이와 테두리** — 한 곳에서 정한다.
 *
 * 같은 판(`TableCard`)을 쓰면서 행 높이는 화면마다 손으로 적고 있었다: 선번장 `h-9`,
 * 계통 `h-11`, 현황은 아예 안 적어 내용에 따라 들쭉날쭉했다. 같은 표가 화면을 옮기면 줄 사이가
 * 달라 보이고, 「이건 다른 표인가」 하는 순간 눈이 한 번 걸린다.
 *
 * 높이를 **못 박는** 이유는 따로 있다: 이 표들은 눈으로 줄을 세는 물건이라(코어 24심, 회로
 * 10회로) 값이 있는 줄과 빈 줄의 높이가 다르면 셈이 흐트러진다 — 실제로 컨트롤이 없는 빈 자리
 * 행만 10px 낮았던 적이 있다.
 *
 * 36px 은 값 한 줄(20px)에 위아래 숨(8px씩)을 둔 크기다 — 스위치도 인라인 편집 상자도 이 안에
 * 들어간다.
 */
export const TABLE_ROW = 'h-7 border-b border-line focus-visible:outline-none focus-ring-input';

/**
 * 표 판의 폭 단계 — **표 상자 자신의 폭**으로 정한다(화면 폭이 아니다: 같은 1280 에서도 레일이 서면 판이 좁다).
 * `wide` ≥ 900 · `mid` 700–899 · `narrow` < 700 (§1.7-e). 표마다 경계를 바꿀 수 있다(`breakpoints`).
 */
export type TableTier = 'wide' | 'mid' | 'narrow';

/**
 * 넓은 표의 열 선언 — **순위**가 좁은 판에서 무엇을 남길지 정한다(§1.7-e).
 *
 * - `priority` 1(기본) 늘 선다 · 2 `wide` 에서만 선다(좁으면 다른 열에 **병합**되어 읽힌다) · 3 `narrow` 에서 숨는다.
 * - `merged` — 병합 표기 열. P2 열들 대신 `wide` 가 아닐 때만 선다(「전압」+「용량」 → 「정격」). `priority: 3` 을 함께 주면
 *   `narrow` 에서는 그마저 숨는다.
 * - `hidden` — 부르는 쪽이 숨긴다(블록 안에서 값이 모두 빈 열).
 *
 * 숨거나 병합된 값은 그 줄의 **닿을 수 있는** 대표 칸(코어 번호 단추·차단기 번호)의 `title`·`aria-description` 에 모은다(§1.7-e2).
 */
export interface TableColumn {
  key: string;
  /** 비율(수) 또는 고정 폭(`'40px'`). 보이는 비율 열끼리 남은 폭을 나눈다(합을 다시 100 으로 맞춘다). */
  width: number | `${number}px`;
  priority?: 1 | 2 | 3;
  merged?: boolean;
  hidden?: boolean;
  /**
   * 비율 열의 **읽을 수 있는 최소 폭(px)** — 한 열이라도 주면 단계는 폭 경계(`breakpoints`)가 아니라 **「다 드는가」**로 정한다:
   * wide → mid → narrow 차례로, 서는 열의 고정 폭 + 최소 폭의 합이 판 폭에 드는 첫 단계(§1.7-e2). 판이 넓어질수록 열이
   * 덜 서는 일(1440 + 레일이 1280 보다 좁게 읽히던 선번장)이 없다.
   */
  minWidth?: number;
}

export interface TableLayout {
  tier: TableTier;
  /** P2 열이 병합 표기로 읽힌다(`tier !== 'wide'`). */
  merged: boolean;
  /** 이 열이 지금 서는가 — 선언되지 않은 열 키는 늘 선다. */
  shows: (key: string) => boolean;
  /** 지금 서는 열 수 — 묶음 머리줄 `colSpan`. */
  colCount: number;
}

const ALL: TableLayout = { tier: 'wide', merged: false, shows: () => true, colCount: 0 };
const LayoutContext = createContext<TableLayout>(ALL);

/** 표 안(`TableCard` 의 자식)에서 지금 폭 단계와 보이는 열을 읽는다. */
export const useTableLayout = () => useContext(LayoutContext);

/** 열이 이 단계에서 서는가 — 순위 규칙 한 곳. */
export function columnShows(c: TableColumn, tier: TableTier): boolean {
  if (c.hidden) return false;
  /* 병합 열도 순위 3 이면 가장 좁은 단계에서는 숨는다(선번장 「최근 측정」). */
  if (c.merged) return tier !== 'wide' && !(c.priority === 3 && tier === 'narrow');
  if (c.priority === 2) return tier === 'wide';
  if (c.priority === 3) return tier !== 'narrow';
  return true;
}

/** 이 단계에서 서는 열이 읽히려면 필요한 폭 — 고정 폭 + 비율 열의 최소 폭. */
export function requiredWidth(columns: readonly TableColumn[], tier: TableTier): number {
  return columns
    .filter((c) => columnShows(c, tier))
    .reduce((a, c) => a + (typeof c.width === 'number' ? (c.minWidth ?? 0) : parseFloat(c.width)), 0);
}

/** 「다 드는가」로 단계를 고른다 — wide → mid → narrow 중 필요한 폭이 판 폭에 드는 첫 단계(못 재었으면 wide). */
export function fitTier(columns: readonly TableColumn[], width: number): TableTier {
  if (width <= 0) return 'wide';
  if (requiredWidth(columns, 'wide') <= width) return 'wide';
  return requiredWidth(columns, 'mid') <= width ? 'mid' : 'narrow';
}

export function tierOf(width: number, [wideMin, midMin]: readonly [number, number] = [900, 700]): TableTier {
  /* 아직 재지 못했다(jsdom·첫 그림 전) — 다 세운다. */
  if (width <= 0 || width >= wideMin) return 'wide';
  return width >= midMin ? 'mid' : 'narrow';
}

/**
 * 서는 열의 폭(px) — 고정 열은 제 폭, 비율 열은 남은 폭을 비율로 나누되 `minWidth` 아래로 내려가지 않는다.
 * 최소 폭의 합조차 들지 않으면 null(비율 % 로 물러난다 — 그때 글 칸은 두 줄로 접힌다).
 */
export function waterfill(shown: readonly TableColumn[], width: number): string[] | null {
  const fixed = shown.reduce((a, c) => a + (typeof c.width === 'number' ? 0 : parseFloat(c.width)), 0);
  let free = width - fixed;
  const ratio = shown.filter((c) => typeof c.width === 'number');
  if (ratio.reduce((a, c) => a + (c.minWidth ?? 0), 0) > free) return null;
  const out = new Map<string, number>();
  let rest = [...ratio];
  /* 몫이 최소 폭보다 작은 열을 최소 폭에 묶고, 남은 폭으로 다시 나눈다 — 더 묶을 열이 없을 때까지. */
  for (;;) {
    const sum = rest.reduce((a, c) => a + (c.width as number), 0);
    const pinned = rest.filter((c) => c.minWidth != null && (free * (c.width as number)) / sum < c.minWidth);
    if (pinned.length === 0) {
      for (const c of rest) out.set(c.key, (free * (c.width as number)) / sum);
      break;
    }
    for (const c of pinned) { out.set(c.key, c.minWidth!); free -= c.minWidth!; }
    rest = rest.filter((c) => !pinned.includes(c));
    if (rest.length === 0) break;
  }
  return shown.map((c) => (typeof c.width === 'number' ? `${Math.floor(out.get(c.key) ?? 0)}px` : c.width));
}

/** 상자의 폭을 잰다 — 붙을 때 한 번(그리기 전) + 바뀔 때마다. */
function useBoxWidth<T extends HTMLElement>(): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((es) => { const r = es[0]?.contentRect.width; if (r != null) setW(r); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function TableCard({
  widths,
  columns,
  tier: forcedTier,
  breakpoints,
  fill = false,
  children,
  className,
  ...rest
}: {
  /**
   * 열 폭 — 수는 비율(%), `'40px'` 꼴은 고정 폭. 열 개수와 순서가 머리글과 같아야 한다. 순위가 없는 표(늘 다 서는 표)용.
   *
   * 비율만 쓰면 합이 100 이 되게 준다. **섞으면** 고정 폭 열이 먼저 제 폭을 갖고, 비율 열들이
   * 남은 폭을 그 비율대로 나눈다(비율의 합은 100). 내용 폭이 정해진 열(번호·상태·수·날짜)은
   * 고정 폭으로, 이름처럼 길이가 들쭉날쭉한 열은 비율로 둔다. 표의 바닥 폭(`min-w-*`)은 두지 않는다 —
   * 판이 좁으면 `columns` 순위로 열을 병합·숨긴다(§1.7-e).
   */
  widths?: readonly (number | `${number}px`)[];
  /** 순위가 있는 열 선언(`TableColumn`) — 주면 `widths` 대신 쓴다. 칸은 `Th col`·`Td col` 로 이 키를 단다. */
  columns?: readonly TableColumn[];
  /** 폭과 무관하게 이 단계로 그린다 — 편집 창(늘 다 세움)·인쇄. */
  tier?: TableTier;
  /** `[wide 하한, mid 하한]` — 기본 `[900, 700]`. */
  breakpoints?: readonly [number, number];
  /**
   * 표가 **주어진 높이를 채운다** — 행 수와 무관하게 카드 크기가 같고, 넘치면 카드 안에서
   * 세로로 스크롤한다(머리글은 `sticky` 로 남는다).
   *
   * 기본(false)은 행만큼만 자라고 스크롤은 바깥이 맡는다 — 현황·선번장처럼 표가 화면의
   * 주인공일 때. `fill` 은 표가 **패널의 한 칸**을 차지할 때다: 행이 몇 개든 화면 구성이
   * 그대로여야 한다(§1.6).
   */
  fill?: boolean;
  /** 묶음 머리줄의 `colSpan`·병합 표기가 지금 단계를 알아야 하면 함수로 받는다. */
  children: ReactNode | ((layout: TableLayout) => ReactNode);
  className?: string;
  'data-testid'?: string;
}) {
  const [ref, width] = useBoxWidth<HTMLDivElement>();
  const tier = forcedTier ?? (columns?.some((c) => c.minWidth != null) ? fitTier(columns, width) : tierOf(width, breakpoints));
  const layout = useMemo<TableLayout>(() => {
    if (!columns) return { ...ALL, tier, colCount: widths?.length ?? 0 };
    const on = new Set(columns.filter((c) => columnShows(c, tier)).map((c) => c.key));
    return { tier, merged: tier !== 'wide', shows: (k) => on.has(k) || !columns.some((c) => c.key === k), colCount: on.size };
  }, [columns, widths, tier]);
  const cols = useMemo(() => {
    const shown = columns ? columns.filter((c) => columnShows(c, tier)) : null;
    const ws = shown ? shown.map((c) => c.width) : widths ?? [];
    /* 최소 폭이 있는 비율 열 — 잰 폭으로 px 를 나눠 준다(물 채우기): 몫이 최소 폭보다 작은 열은 최소 폭을 갖고, 남은 폭을
       나머지가 비율대로 나눈다. 그래야 「비고」 같은 작은 몫의 열이 최소 폭 아래로 눌리지 않는다. */
    if (shown && width > 0 && shown.some((c) => c.minWidth != null)) {
      const px = waterfill(shown, width);
      if (px) return px;
    }
    /* 보이는 비율 열끼리 100 을 나눈다 — 숨은 열의 몫이 빈 자리로 남지 않게. */
    const sum = ws.reduce<number>((a, w) => a + (typeof w === 'number' ? w : 0), 0);
    return ws.map((w) => (typeof w === 'number' ? `${sum > 0 ? (w / sum) * 100 : 0}%` : w));
  }, [columns, widths, tier, width]);

  return (
    <div
      ref={ref}
      data-testid={rest['data-testid']}
      data-tier={columns ? tier : undefined}
      className={cn(
        'min-w-0 rounded border border-line bg-surface',
        // `clip` 은 스크롤 상자를 만들지 않는다 — 위 주석 참고. `fill` 일 때만 (세로) 스크롤 상자다.
        fill ? 'flex h-full min-h-0 flex-col overflow-y-auto overflow-x-hidden' : 'overflow-clip',
        className,
      )}
    >
      <LayoutContext.Provider value={layout}>
        <table className="w-full table-fixed text-sm">
          <colgroup>
            {cols.map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          {typeof children === 'function' ? children(layout) : children}
        </table>
      </LayoutContext.Provider>
    </div>
  );
}

/**
 * 표 본문 한 칸 — **줄맞춤은 열이 정한다**.
 *
 * 칸 안의 내용이 제 줄맞춤을 정하면 같은 열에서 값과 대시가 어긋난다. 실제로 그랬다:
 * 인라인 편집 칸이 「수면 오른쪽」이라고 스스로 정하는 바람에, 코어 수가 있는 줄은 오른쪽
 * 끝에 서고 값이 없어 대시만 있는 줄은 왼쪽 끝에 서서 한 열이 뒤죽박죽으로 읽혔다.
 *
 * 그래서 `text-align` 은 **여기서만** 정하고 안쪽은 물려받는다(`[text-align:inherit]`).
 * 수 칸은 자릿수 고정 글꼴까지 함께 받는다 — 자릿수가 세로로 맞아야 크기가 비교된다.
 */
export function Td({
  children, className, align = 'left', col, ...rest
}: Omit<TdHTMLAttributes<HTMLTableCellElement>, 'align'> & {
  children?: ReactNode;
  /** 수는 오른쪽으로. 같은 열의 머리글(`Th`)과 같은 값을 준다. */
  align?: 'left' | 'right';
  /** 열 키(`TableCard columns`) — 그 열이 지금 서지 않으면 칸도 그리지 않는다. `data-col` 로도 붙는다. */
  col?: string;
}) {
  const layout = useTableLayout();
  if (col != null && !layout.shows(col)) return null;
  return (
    <td
      data-col={col}
      /* **수는 줄바꿈하지 않는다.** 「350,000원」이 칸에 안 들어가면 「350,000」/「원」 두 줄로
         쪼개지는데, 그러면 같은 열의 줄 높이가 제각각이 되고 수가 한눈에 안 읽힌다. 좁으면
         넘치게 두는 편이 낫다 — 열 폭은 `TableCard` 가 정하는 것이지 값이 정할 일이 아니다. */
      className={cn(
        'px-2.5 py-1',
        align === 'right' ? 'whitespace-nowrap text-right tabular-nums' : 'text-left',
        className,
      )}
      {...rest}
    >
      {children}
    </td>
  );
}

interface ThProps extends Omit<ThHTMLAttributes<HTMLTableCellElement>, 'align'> {
  children: ReactNode;
  /** 수는 오른쪽으로 — 자릿수가 세로로 맞아야 크기가 비교된다. */
  align?: 'left' | 'right';
  /**
   * 단위 — 이름 뒤 **괄호로 같은 줄에** 붙는다: `길이(m)`·`자재단가(원)`(§1.7-g). 단위만 넣는다 —
   * 「경쟁」·「183일」 같은 수식어는 단위가 아니다(그건 묶음 머리 `colSpan` 으로).
   */
  unit?: string;
  /** 열 키(`TableCard columns`) — 그 열이 지금 서지 않으면 머리 칸도 그리지 않는다. */
  col?: string;
  /**
   * 이 열로 정렬한다 — 주면 머리글이 **누를 수 있는 것**이 된다.
   *
   * 주지 않으면 아무 일도 없다: 정렬되는 열과 안 되는 열이 똑같이 생기는 일이 없다.
   */
  onSort?: () => void;
  /** 지금 이 열로 정렬돼 있는가. `onSort` 가 있을 때만 뜻이 있다. */
  sort?: 'asc' | 'desc' | null;
  /**
   * 내용이 **제 배치를 갖는다** — 말줄임 감싸개를 두르지 않는다. 묶음 머리줄(`colSpan` 으로 표 폭을
   * 다 쓰는 한 줄: 제목 + 메타 + 단추)용이다. 잘림은 내용이 맡는다.
   */
  bare?: boolean;
}

/**
 * 표 머리글 셀 — **머리글이 머리글로 보이게** 하는 단일 지점.
 *
 * 예전에는 배경이 `bg-surface`(흰색)라 본문 행과 **완전히 같은 색**이었고, 1px 선 하나로만
 * 갈렸다. 그래서 선번장의 「슬롯 1」 구분행(색이 있다)이 진짜 머리글보다 머리글처럼 보였다.
 * 면을 한 단 내리고 글자를 굵혀 위계를 만든다.
 *
 * **머리글은 늘 한 줄이다**(§1.7-g). 한글은 어디서나 끊기므로 접게 두면 머리줄 높이가 표마다 달라진다.
 * 단위도 같은 줄 괄호에 둔다 — 예전에는 단위를 아랫줄에 내려 그 표의 머리줄만 35px 로 부풀었다.
 * 이름이 안 들어가면 그 열의 **폭이 틀린 것**이다(`TableCard widths`/`columns` 를 고친다).
 *
 * 배경이 **불투명**해야 `sticky` 머리글 아래로 행이 비치지 않는다.
 */
export function Th({ children, className, align = 'left', unit, col, onSort, sort = null, bare = false, ...rest }: ThProps) {
  const layout = useTableLayout();
  if (col != null && !layout.shows(col)) return null;
  const label = unit ? <>{children}<span className="font-normal">({unit})</span></> : children;
  return (
    <th
      /* 스크린리더가 「정렬됨」을 읽을 방법 — 없으면 정렬은 눈에만 있는 기능이다. */
      aria-sort={onSort ? (sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : 'none') : undefined}
      className={cn(
        'h-6 border-b border-line-strong bg-surface-2 px-2.5 text-xs font-bold text-content-muted',
        'whitespace-nowrap break-keep',
        align === 'right' ? 'text-right' : 'text-left',
        className,
      )}
      {...rest}
    >
      {bare ? children : onSort ? (
        /* 누를 수 있는 것은 **단추**여야 한다 — `<th onClick>` 은 키보드로 닿지 않는다.
           쉬는 상태에도 흐린 이중 화살표를 세운다: 어포던스 없는 클릭 타깃은 없는 것과
           같아서, 정렬된다는 사실 자체를 아무도 모른다. */
        <button
          type="button"
          onClick={onSort}
          className={cn(
            'group flex w-full min-w-0 items-center gap-1 rounded text-inherit',
            'transition-colors hover:text-content focus-visible:outline-none focus-ring-input',
            align === 'right' && 'justify-end',
          )}
        >
          <span className="min-w-0 truncate">{label}</span>
          {sort === 'asc' ? (
            <ChevronUp size={12} className="shrink-0 text-primary" aria-hidden />
          ) : sort === 'desc' ? (
            <ChevronDown size={12} className="shrink-0 text-primary" aria-hidden />
          ) : (
            <ChevronsUpDown
              size={12}
              className="shrink-0 text-content-faint opacity-40 transition-opacity group-hover:opacity-100"
              aria-hidden
            />
          )}
        </button>
      ) : (
        <span className="block truncate">{label}</span>
      )}
    </th>
  );
}
