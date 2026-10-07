import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';
import { HOVER_REVEAL } from './hoverReveal';
import { SELECTABLE } from './selection';

/**
 * 카드 안 목록의 한 줄 — 이름 하나를 읽고, `onClick` 을 주면 누를 수 있다(랙 안의 설비 목록).
 * 긴 이름은 잘리고(`truncate`), 누를 수 있는 줄은 선택 가능한 표면의 호버를 쓴다.
 */
/* `title` — 잘린 줄의 온 글을 손을 얹으면 보인다. */
type Aria = Pick<HTMLAttributes<HTMLElement>, 'aria-disabled' | 'aria-selected' | 'aria-current' | 'title'>;

/**
 * `trailing` 을 주면 **탐색 목록 줄**이 된다 — 이름은 왼쪽, 오른쪽 끝에 개수 같은 부가값(`tabular-nums`)이 서고
 * 줄은 트리 행과 같은 높이다(품목 관리의 왼쪽 목록).
 */
export function ListRow({ children, onClick, className, trailing, ...aria }: { children: ReactNode; onClick?: () => void; className?: string; trailing?: ReactNode } & Aria) {
  const base = trailing !== undefined
    /* 줄 높이는 두 꼴 모두 28px(`py-1` + 20) — 트리 행·표 줄(`TABLE_ROW` h-7)과 같은 밀도. 카드 여백은 목록 전체가 한 번 받는다. */
    ? 'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm text-content'
    : 'block w-full truncate rounded px-1 py-1 text-left text-sm text-content';
  const body = trailing !== undefined
    ? (<><span className="min-w-0 flex-1 truncate">{children}</span><span className="shrink-0 text-xs tabular-nums text-content-muted">{trailing}</span></>)
    : children;
  if (!onClick) return <div className={cn(base, className)} {...aria}>{body}</div>;
  return <button type="button" className={cn(base, SELECTABLE, className)} onClick={onClick} {...aria}>{body}</button>;
}

/**
 * 목록 안 묶음의 머리 한 줄(「설비」·「차단기」·「코어」) — 줄들 위에 작은 라벨로 선다.
 * 카드의 절 제목(`DetailCardHeader`)이 아니라 **한 목록 안의 갈래**다.
 * `action` — 그 갈래 전체에 대한 손짓 하나(연결 탭 「입력 전원」의 「전원 계통에서 보기」). 오른쪽 끝, 늘 보인다.
 */
export function ListHeading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  if (action === undefined) return <div className="px-1 pt-1 text-xs text-content-muted">{children}</div>;
  return (
    <div className="flex items-center gap-2 px-1 pt-1 text-xs text-content-muted">
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <span className="shrink-0">{action}</span>
    </div>
  );
}

/**
 * 목록 줄 + **호버에서 드러나는 손잡이**(§1.7) — 연결 목록처럼 한 줄에 값이 여럿이다.
 *
 * `actions` 는 자리를 늘 차지한 채 투명도만 바뀐다(떨림 방지).
 *
 * - `meta` 를 주면 **두 줄 줄**이 된다: 첫 줄 `children`(진하게 — 그 줄만의 것), 둘째 줄 `meta`(`text-xs` 흐리게).
 *   둘 다 넘치면 말줄임. 좁은 패널(364px)에서 칸 넷을 한 줄에 늘어세우면 고정 폭 칸들이 자리를 다 먹고
 *   정작 늘어나야 할 칸이 0px 로 눌린다(연결 목록의 상대 끝이 실제로 그랬다) — 그때 이것을 쓴다.
 * - `meta` 가 없으면 `children` 칸들이 가로로 늘어선다. 칸 폭·잘림은 부르는 쪽이 정한다(`truncate` 에는 `min-w-0`).
 */
export function ListItemRow({ children, meta, actions }: { children: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="group flex items-center gap-2 border-b border-line py-1 text-sm text-content">
      {meta !== undefined ? (
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{children}</div>
          <div className="truncate text-xs text-content-muted">{meta}</div>
        </div>
      ) : children}
      {actions && (
        <span className={cn('flex shrink-0 items-center gap-0.5', HOVER_REVEAL)}>
          {actions}
        </span>
      )}
    </div>
  );
}
