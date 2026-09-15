import { Fragment } from 'react';
import { cn } from './cn';

export interface MenuBarItem {
  key: string;
  label: string;
  /** 이 뒤에 옅은 구분선 — 다루는 것이 달라지는 자리. */
  divideAfter?: boolean;
}

/**
 * 주 메뉴 띠 — 상단 띠 바로 아래.
 *
 * 고른 항목만 **흰 바탕으로 솟고 위에 파란 선**이 그어진다. 업무 시스템의 관용구이며,
 * 「지금 어디에 있나」를 배경색 하나로 말한다 — 밑줄이나 글자 굵기만으로는 회색 띠 위에서
 * 잘 읽히지 않는다.
 *
 * 이 컴포넌트는 **길을 모른다.** 라우팅·저장 확인은 부르는 쪽이 한다(`onSelect`) —
 * 떠나기 전에 묻는 자리는 앱에 하나뿐이어야 하기 때문이다(`V2Shell`).
 */
export function MenuBar({
  items, activeKey, onSelect, className,
}: {
  items: readonly MenuBarItem[];
  activeKey: string | null;
  onSelect: (key: string) => void;
  className?: string;
}) {
  return (
    <nav
      aria-label="주요 메뉴"
      className={cn('flex h-[34px] shrink-0 items-stretch border-b border-line-strong bg-surface-2 px-4', className)}
    >
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <Fragment key={item.key}>
            <button
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => onSelect(item.key)}
              className={cn(
                'relative -mb-px shrink-0 px-4 text-sm transition-colors focus-ring',
                active
                  ? 'border-x border-line-strong bg-surface font-bold text-appbar'
                  : 'text-content-muted hover:text-content',
              )}
            >
              {/* 솟은 탭의 머리선 — 활성 표시는 색 하나가 아니라 **바탕 + 머리선**이다. */}
              {active && <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] bg-primary" />}
              {item.label}
            </button>
            {item.divideAfter && <span aria-hidden className="my-2 mx-1 w-px shrink-0 bg-line-strong" />}
          </Fragment>
        );
      })}
    </nav>
  );
}
