import type { ReactNode, ThHTMLAttributes } from 'react';
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
export function TableCard({
  widths,
  fill = false,
  children,
  className,
}: {
  /** 열 폭 비율. 합이 100 이 되게 준다. 열 개수와 순서가 머리글과 같아야 한다. */
  widths: readonly number[];
  /**
   * 표가 **주어진 높이를 채운다** — 행 수와 무관하게 카드 크기가 같고, 넘치면 카드 안에서
   * 스크롤한다(머리글은 `sticky` 로 남는다).
   *
   * 기본(false)은 행만큼만 자라고 스크롤은 바깥이 맡는다 — 현황·선번장처럼 표가 화면의
   * 주인공일 때. `fill` 은 표가 **패널의 한 칸**을 차지할 때다: 행이 몇 개든 화면 구성이
   * 그대로여야 한다(§1.6).
   */
  fill?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-lg border border-line bg-surface',
        // `clip` 은 스크롤 상자를 만들지 않는다 — 위 주석 참고. `fill` 일 때만 스크롤 상자다.
        fill ? 'flex h-full min-h-0 flex-col overflow-auto' : 'overflow-clip',
        className,
      )}
    >
      <table className="w-full table-fixed text-sm">
        <colgroup>
          {widths.map((w, i) => (
            <col key={i} style={{ width: `${w}%` }} />
          ))}
        </colgroup>
        {children}
      </table>
    </div>
  );
}

interface ThProps extends Omit<ThHTMLAttributes<HTMLTableCellElement>, 'align'> {
  children: ReactNode;
  /** 수는 오른쪽으로 — 자릿수가 세로로 맞아야 크기가 비교된다. */
  align?: 'left' | 'right';
  /** 단위는 **이름에 붙이지 않는다** — 붙이면 「노임단가(원/」 처럼 토큰 한가운데서 접힌다. */
  unit?: string;
  /**
   * 이 열로 정렬한다 — 주면 머리글이 **누를 수 있는 것**이 된다.
   *
   * 주지 않으면 아무 일도 없다: 정렬되는 열과 안 되는 열이 똑같이 생기는 일이 없다.
   */
  onSort?: () => void;
  /** 지금 이 열로 정렬돼 있는가. `onSort` 가 있을 때만 뜻이 있다. */
  sort?: 'asc' | 'desc' | null;
}

/**
 * 표 머리글 셀 — **머리글이 머리글로 보이게** 하는 단일 지점.
 *
 * 예전에는 배경이 `bg-surface`(흰색)라 본문 행과 **완전히 같은 색**이었고, 1px 선 하나로만
 * 갈렸다. 그래서 선번장의 「슬롯 1」 구분행(색이 있다)이 진짜 머리글보다 머리글처럼 보였다.
 * 면을 한 단 내리고 글자를 굵혀 위계를 만든다.
 *
 * **줄을 접지 않는다.** 한글은 어디서나 끊기므로(`break-keep` 이 없으면 「원/」+「일)」로
 * 쪼개진다) 머리글 높이가 행보다 커지고 표가 들쭉날쭉해진다. 넘치면 접는 대신 말줄임한다 —
 * 폭이 모자란 것이지 이름이 두 줄짜리인 게 아니다.
 *
 * 배경이 **불투명**해야 `sticky` 머리글 아래로 행이 비치지 않는다.
 */
export function Th({ children, className, align = 'left', unit, onSort, sort = null, ...rest }: ThProps) {
  const label = (
    <>
      {children}
      {/* 단위는 이름보다 한 단 흐리게 — 무엇을 세는 열인지는 이름이 말하고, 단위는 곁들인다. */}
      {unit && <span className="ml-1 font-normal text-content-faint">{unit}</span>}
    </>
  );
  return (
    <th
      /* 스크린리더가 「정렬됨」을 읽을 방법 — 없으면 정렬은 눈에만 있는 기능이다. */
      aria-sort={onSort ? (sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : 'none') : undefined}
      className={cn(
        'border-b border-line bg-surface-2 px-3 py-2 text-xs font-semibold text-content-muted',
        'whitespace-nowrap break-keep',
        align === 'right' ? 'text-right' : 'text-left',
        className,
      )}
      {...rest}
    >
      {onSort ? (
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
