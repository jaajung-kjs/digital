import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { IconButton } from './IconButton';
import { useDismissOnOutside } from './useDismissOnOutside';
import { cn } from './cn';
import { SELECTABLE } from './selection';

export interface OverflowMenuItem {
  label: string;
  onSelect: () => void;
  /** 되돌릴 수 없는 것 — 글자가 위험 색을 쓴다. */
  danger?: boolean;
  disabled?: boolean;
  /** 왜 못 누르는지 — `disabled` 일 때 얹으면 뜬다. 말할 수 없으면 항목을 아예 두지 않는다. */
  disabledReason?: string;
}

/**
 * 머리줄의 `⋯` — **자주 쓰지 않거나 되돌릴 수 없는 동작**을 담는다.
 *
 * 파괴적인 동작을 「저장」 옆에 세워 두지 않기 위해 있다. 실제로 대장 편집 바가
 * `[종류 삭제] [취소] [저장]` 이었고 세 단추 사이가 각각 50~70px 이었다 — 게다가 아무것도
 * 고치지 않은 화면에서는 취소·저장이 꺼져 있어 **유일하게 눌리는 단추가 삭제**였다.
 * 손이 미끄러지면 살아 있는 자산이 참조하는 종류가 사라진다.
 *
 * GitHub·Stripe·Atlassian 이 같은 자리를 쓴다: 되돌릴 수 있는 것은 겉으로, 되돌릴 수 없는
 * 것은 한 겹 안으로. 한 번 더 누르게 하는 것이 목적이지 숨기는 것이 목적이 아니다.
 *
 * 키보드는 WAI-ARIA APG 의 메뉴 단추를 따른다: 열면 **첫 항목이 초점을 받고**, ↑↓·Home/End 로
 * 옮기고, Esc 로 닫으면 초점이 `⋯` 로 **돌아온다**. 이것이 없으면 열어 놓고 갈 데가 없다 —
 * 초점은 여전히 `⋯` 에 있고 Tab 은 메뉴를 지나쳐 뒤 화면으로 가 버린다.
 */
export function OverflowMenu({
  label = '더 보기',
  items,
  disabled,
}: {
  label?: string;
  items: OverflowMenuItem[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useDismissOnOutside(open, [box], () => setOpen(false));

  const entries = () => [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];

  /* 열면 초점이 메뉴 안으로 들어간다 — 안 그러면 연 사람이 갈 데가 없다. */
  useEffect(() => {
    if (open) entries()[0]?.focus();
  }, [open]);

  /** 닫고 `⋯` 로 초점을 돌려준다 — 메뉴가 사라진 자리에 초점을 남기지 않는다. */
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <div className="relative" ref={box}>
      <IconButton
        ref={trigger}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal size={14} />
      </IconButton>
      {open && (
        <div
          ref={menu}
          role="menu"
          className="absolute left-0 top-full z-modal mt-1 min-w-40 rounded-md border border-line bg-surface py-1 shadow-lg"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              /* 이 Esc 는 메뉴의 것이다 — 뒤 화면까지 닿으면 고른 것까지 함께 풀린다. */
              e.stopPropagation();
              close();
              return;
            }
            const items = entries();
            const i = items.indexOf(document.activeElement as HTMLElement);
            const to =
              e.key === 'ArrowDown' ? (i + 1) % items.length
              : e.key === 'ArrowUp' ? (i - 1 + items.length) % items.length
              : e.key === 'Home' ? 0
              : e.key === 'End' ? items.length - 1
              : null;
            if (to === null) return;
            e.preventDefault();
            items[to]?.focus();
          }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              /* 메뉴도 하나의 정거장이다 — 항목 사이는 화살표로 옮긴다(§1.7-k). */
              tabIndex={-1}
              disabled={item.disabled}
              title={item.disabled ? item.disabledReason : undefined}
              className={cn(
                'block w-full px-3 py-1.5 text-left text-sm',
                item.danger ? 'text-danger' : 'text-content',
                SELECTABLE,
                item.disabled && 'cursor-not-allowed opacity-50',
              )}
              onClick={() => {
                close();
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
