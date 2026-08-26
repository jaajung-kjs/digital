import { useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { IconButton } from './IconButton';
import { MenuPopup, type MenuAnchor, type MenuItem } from './MenuPopup';

/** 예전 이름 — 부르는 쪽이 많아 남긴다(`MenuItem` 과 같은 것). */
export type OverflowMenuItem = MenuItem;

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
 * 떠 있는 메뉴 자체는 `MenuPopup` 이다 — 우클릭 메뉴와 **같은 한 벌**을 쓴다.
 */
export function OverflowMenu({
  label = '더 보기',
  items,
  disabled,
}: {
  label?: string;
  items: MenuItem[];
  disabled?: boolean;
}) {
  const [at, setAt] = useState<MenuAnchor | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  /** 닫고 `⋯` 로 초점을 돌려준다 — 메뉴가 사라진 자리에 초점을 남기지 않는다. */
  function close() {
    setAt(null);
    trigger.current?.focus();
  }

  return (
    <>
      <IconButton
        ref={trigger}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={at !== null}
        disabled={disabled}
        onClick={() => {
          if (at) return close();
          const r = trigger.current?.getBoundingClientRect();
          /* 단추 **아래**에 선다. 아래가 좁으면 단추 위로 접힌다(`flipY`). */
          if (r) setAt({ x: r.left, y: r.bottom + 4, flipY: r.top - 4 });
        }}
      >
        <MoreHorizontal size={14} />
      </IconButton>
      {at && <MenuPopup items={items} at={at} onClose={close} />}
    </>
  );
}
