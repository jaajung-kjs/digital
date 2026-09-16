import type { ReactNode, Ref } from 'react';
import { cn } from './cn';
import { SelectionScope } from './SelectionScope';

/**
 * 본문이 스크롤을 어떻게 쥐는가 — §1.7-b 의 두 가지를 그대로 옮긴 것이다.
 *
 * - `scroll` — **카드가 스크롤 상자**를 쥔다. 여백은 그 **안쪽 래퍼**가 갖는다: 스크롤
 *   상자에 직접 주면 `sticky` 머리글이 그만큼 내려가 붙고, 그 틈으로 지나가는 행이 비친다.
 * - `fill` — **자식이 다 쥔다.** `TableCard fill` 이 제 스크롤을 갖거나(현황), 스크롤이
 *   아예 없거나(캔버스). 안쪽 여백은 **0** 이다 — 카드는 이미 바깥 여백(`gap-3 p-4`) 뒤에
 *   서 있으므로 한 겹 더 들여쓰면 판이 그만큼 좁아진다.
 */
export type ViewCardBody = 'scroll' | 'fill';

export interface ViewCardProps {
  /** 머리 띠 왼쪽의 **이름** — 「무엇을 보고 있나」가 곧 제목인 카드가 쓴다(상세 패널). */
  title?: ReactNode;
  /** 머리 띠 왼쪽의 **범위를 고르는 것** — 거르개·설비 고르개·갈래, 그리고 판 도구. */
  tools?: ReactNode;
  /** 머리 띠 **오른쪽 끝** — 검색 또는 버튼. 이 자리가 고정이라 네 탭에서 검색의 x 가 같다. */
  actions?: ReactNode;
  /** 카드 **바닥 띠** — `StatusBar`. 지금은 평면도만 쓴다. */
  status?: ReactNode;
  body?: ViewCardBody;
  /** 본문 여백을 눌러도 고른 것을 놓는다(§1.7-d) — 주면 `SelectionScope` 가 선다. */
  onClearSelection?: () => void;
  /** 고른 줄을 화면 안으로 옮길 때 잡는 상자(`useScrollSelectedIntoView`). */
  bodyRef?: Ref<HTMLDivElement>;
  children: ReactNode;
  className?: string;
}

/**
 * 화면의 **판** — 회색 바탕 위에 뜨는 흰 카드 한 장.
 *
 * 예전에는 네 탭(현황·평면도·선번장·계통)이 껍데기를 각자 그렸다. 그래서 좌측 기준선이
 * 0·8·12·16px 네 값으로 갈렸고, 도구바 높이가 32·40·46px 로 달랐으며, 검색이 어떤 탭에서는
 * 맨 왼쪽 어떤 탭에서는 고르개 뒤에 섰다. 같은 일을 하는 자리가 넷이면 그중 하나는 반드시
 * 어긋난다 — 실제로 하나도 안 맞았다.
 *
 * **머리 띠가 곧 도구바다.** 카드가 줄을 하나 더 얹는 것이 아니라, 이미 있던 도구바가
 * 카드의 머리(`DetailCardHeader` 와 같은 `surface-2` 면, §3.2)로 들어간다 — 세로 크롬이
 * 늘지 않는다. 자리는 둘뿐이다: **왼쪽 첫 칸은 늘 「범위를 고르는 것」, 오른쪽 끝은 늘 검색.**
 *
 *     <ViewCard tools={<Select …/>} actions={<TableSearch …/>} body="scroll">…</ViewCard>
 */
export function ViewCard({
  title, tools, actions, status, body = 'fill', onClearSelection, bodyRef, children, className,
}: ViewCardProps) {
  const hasHead = title != null || tools != null || actions != null;
  const boxClass = body === 'scroll'
    ? 'min-h-0 flex-1 overflow-auto'
    : 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden';
  /* `scroll` 에서 ref 는 **안쪽 래퍼**가 받는다 — 여백을 가진 쪽이 곧 내용의 상자다. */
  const inner = body === 'scroll'
    ? <div className="p-4" ref={bodyRef}>{children}</div>
    : children;

  return (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col border border-line-strong bg-surface',
        className,
      )}
    >
      {hasHead && (
        /* 머리 띠 높이가 28px 인 `DetailCardHeader` 와 다른 것은 여기에 `size="sm"`
           컨트롤(24px)이 들어서기 때문이다 — 뷰 탭 줄과 같은 32px 로 맞춰 둘이 한 리듬이 된다. */
        <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line-strong bg-surface-2 px-3">
          {title != null && (
            <span className="flex min-w-0 items-center gap-1 truncate text-sm font-semibold text-content">
              {title}
            </span>
          )}
          {tools}
          {actions != null && (
            <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div>
          )}
        </div>
      )}
      {onClearSelection ? (
        <SelectionScope
          onClear={onClearSelection}
          className={boxClass}
          ref={body === 'scroll' ? undefined : bodyRef}
        >
          {inner}
        </SelectionScope>
      ) : (
        <div className={boxClass} ref={body === 'scroll' ? undefined : bodyRef}>
          {inner}
        </div>
      )}
      {status}
    </div>
  );
}
