import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDismissOnOutside } from './useDismissOnOutside';
import { cn } from './cn';
import { SELECTABLE } from './selection';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  /** 되돌릴 수 없는 것 — 글자가 위험 색을 쓴다. */
  danger?: boolean;
  disabled?: boolean;
  /** 왜 못 누르는지 — `disabled` 일 때 얹으면 뜬다. 말할 수 없으면 항목을 아예 두지 않는다. */
  disabledReason?: string;
}

/** 어디에 세울까 — 누른 자리(`x`,`y`). 아래가 좁으면 `flipY` 를 바닥으로 삼아 위로 편다. */
export interface MenuAnchor {
  x: number;
  y: number;
  flipY?: number;
}

/**
 * 떠 있는 메뉴 한 벌 — `⋯` 도, 우클릭도 **이것 하나**를 쓴다.
 *
 * 두 벌이 되면 갈린다: 키보드 규약(↑↓·Home/End·Esc)과 잘림 방지(포털)와 바깥 눌림 판정이
 * 각자 자라고, 그러면 우클릭 메뉴만 화살표가 안 먹는 식이 된다.
 *
 * **화면 위에 띄운다**(포털 + 고정 좌표). 제자리에 그리면 스크롤 상자 안에서 잘린다 —
 * 트리의 줄마다 이 메뉴가 서므로, 아래쪽 줄에서 열면 목록 밖으로 나가는 부분이 사라진다.
 *
 * 키보드는 WAI-ARIA APG 의 메뉴를 따른다: 열면 **첫 항목이 초점을 받고**, ↑↓·Home/End 로
 * 옮기고, Esc 로 닫는다. 닫을 때 초점을 어디로 돌려줄지는 **부르는 쪽**이 안다(`onClose`).
 */
export function MenuPopup({
  items,
  at,
  onClose,
}: {
  items: MenuItem[];
  at: MenuAnchor;
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; top: number } | null>(null);
  useDismissOnOutside(true, [menu], onClose);

  const entries = () => [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];

  /* 열면 초점이 메뉴 안으로 들어간다 — 안 그러면 연 사람이 갈 데가 없다. */
  useEffect(() => {
    entries()[0]?.focus();
  }, []);

  /** 그린 뒤에 재서 자리를 잡는다 — 아래·오른쪽이 좁으면 접어 넣는다(깜빡이지 않는다). */
  useLayoutEffect(() => {
    const w = menu.current?.offsetWidth ?? 0;
    const h = menu.current?.offsetHeight ?? 0;
    const fitsBelow = window.innerHeight - at.y >= h + 8;
    setBox({
      left: Math.min(at.x, window.innerWidth - w - 8),
      top: fitsBelow ? at.y : Math.max(8, (at.flipY ?? at.y) - h),
    });
  }, [at.x, at.y, at.flipY, items.length]);

  return createPortal(
    <div
      ref={menu}
      role="menu"
      style={{
        position: 'fixed',
        left: box?.left ?? -9999,
        top: box?.top ?? -9999,
        visibility: box ? 'visible' : 'hidden',
      }}
      className="z-modal min-w-40 rounded-md border border-line bg-surface py-1 shadow-lg"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          /* 이 Esc 는 메뉴의 것이다 — 뒤 화면까지 닿으면 고른 것까지 함께 풀린다. */
          e.stopPropagation();
          onClose();
          return;
        }
        const els = entries();
        const i = els.indexOf(document.activeElement as HTMLElement);
        const to =
          e.key === 'ArrowDown' ? (i + 1) % els.length
          : e.key === 'ArrowUp' ? (i - 1 + els.length) % els.length
          : e.key === 'Home' ? 0
          : e.key === 'End' ? els.length - 1
          : null;
        if (to === null) return;
        e.preventDefault();
        els[to]?.focus();
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
            onClose();
            item.onSelect();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
