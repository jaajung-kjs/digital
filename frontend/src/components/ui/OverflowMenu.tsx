import { useRef, useState } from 'react';
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
  useDismissOnOutside(open, [box], () => setOpen(false));

  return (
    <div className="relative" ref={box}>
      <IconButton
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
          role="menu"
          className="absolute left-0 top-full z-modal mt-1 min-w-40 rounded-md border border-line bg-surface py-1 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              title={item.disabled ? item.disabledReason : undefined}
              className={cn(
                'block w-full px-3 py-1.5 text-left text-sm',
                item.danger ? 'text-danger' : 'text-content',
                SELECTABLE,
                item.disabled && 'cursor-not-allowed opacity-50',
              )}
              onClick={() => {
                setOpen(false);
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
