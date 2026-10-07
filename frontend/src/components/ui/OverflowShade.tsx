import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 넓은 표가 판을 가로로 넘칠 때 **가려진 오른쪽 가장자리에 옅은 그늘**을 세운다(§1.7-e 예외 — 선번장·전원 계통).
 * 상세 패널이 서서 판이 좁아지면 표는 짓눌리지 않고 가로로 구르는데, 그늘이 없으면 오른쪽 열이 있다는 것을 모른다.
 *
 * 돌려주는 `bodyRef` 는 `ViewCard` 의 `bodyRef` 에 단다(`body="scroll"` 이면 스크롤 상자의 안쪽 래퍼 — 스크롤 상자는 그 부모다).
 * **콜백 ref** 라 그 요소가 바뀌면(계통도 → 대장처럼 `body` 가 바뀌어 다른 요소가 서면) 새 요소에 다시 붙는다 —
 * ref 객체를 의존성으로 두면 처음 붙은 요소만 지켜보아 보기를 바꾼 뒤 그늘이 서지 않았다.
 * 지금 요소는 `body.current` 로 읽는다(블록 초점의 `scrollBoxToTop`).
 * 그늘의 윗변은 머리 띠 높이를 외워 두지 않고 **스크롤 상자의 자리**에서 잰다(띠 높이가 바뀌어도 따라간다).
 * 돌려주는 `frameRef` 는 판을 감싸는 `relative` 틀에 단다 — 그늘은 그 틀 기준으로 선다.
 */
export function useOverflowShade() {
  const frameRef = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement | null>(null);
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const bodyRef = useCallback((node: HTMLDivElement | null) => { body.current = node; setEl(node); }, []);
  const [top, setTop] = useState<number | null>(null);
  useEffect(() => {
    const box = el?.parentElement;
    if (!el || !box) { setTop(null); return; }
    const check = () => {
      const clipped = box.scrollLeft + box.clientWidth < box.scrollWidth - 1;
      const frame = frameRef.current?.getBoundingClientRect().top ?? 0;
      setTop(clipped ? Math.round(box.getBoundingClientRect().top - frame) : null);
    };
    check();
    box.addEventListener('scroll', check, { passive: true });
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(check);
    ro?.observe(box);
    ro?.observe(el);
    return () => { box.removeEventListener('scroll', check); ro?.disconnect(); };
  }, [el]);
  return { frameRef, bodyRef, body, top };
}

/** `useOverflowShade` 의 그늘 — 넘치지 않으면(`top == null`) 그리지 않는다. */
export function OverflowShade({ top }: { top: number | null }) {
  if (top == null) return null;
  return (
    <div
      aria-hidden data-testid="overflow-shade"
      className="pointer-events-none absolute bottom-px right-px w-4 bg-gradient-to-l from-content/15 to-transparent"
      style={{ top }}
    />
  );
}

/**
 * 스크롤 상자 안의 `el` 을 **세로로만** 위로 굴린다(`pad` 만큼 띄워서). `scrollIntoView` 는 가로로 넘친 판까지
 * 함께 밀어 보던 열을 옆으로 옮긴다 — 블록 초점은 세로 자리만 바꾼다.
 */
export function scrollBoxToTop(bodyEl: HTMLElement | null, el: HTMLElement | null, pad = 16) {
  const box = bodyEl?.parentElement;
  if (!box || !el) return;
  const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - pad;
  box.scrollTo?.({ top: Math.max(0, top) });
}
