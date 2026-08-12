import { useEffect, useRef, type RefObject } from 'react';

/**
 * **바깥을 누르면 고른 것이 풀린다** — 앱 어디서나 같은 규칙.
 *
 * 고르는 화면마다 제 손으로 「빈 곳」을 정의하면 반드시 한 곳이 빠진다. 실제로 격자는
 * 빈 칸과 Esc 만 알아, 상단 머리줄이나 목록처럼 **아무 상관없는 데**를 눌러도 선택이
 * 남아 있었다. 무엇이 「안」인지만 말하면 나머지는 전부 바깥이다.
 *
 * @param active 고른 것이 있을 때만 듣는다 — 없으면 붙일 이유가 없다.
 * @param within 이 안을 누른 것은 바깥이 아니다. 판과 **그 상세 패널**을 함께 넘긴다 —
 *   고른 것을 다루는 자리에서 이름을 고치다 선택이 풀리면 안 된다.
 * @param onDismiss 풀기.
 *
 * `pointerdown` 을 캡처 단계에서 듣는다: 마우스를 뗄 때(click)까지 기다리면 그사이 손짓
 * (끌기)이 시작돼 판정이 엉킨다.
 */
export function useDismissOnOutside(
  active: boolean,
  within: ReadonlyArray<RefObject<HTMLElement | null>>,
  onDismiss: () => void,
): void {
  /* 매 렌더 새 배열·새 함수가 오므로 ref 로 읽는다 — 의존성에 넣으면 리스너를 렌더마다
     떼었다 붙여, 그사이 눌린 것을 놓친다. */
  const latest = useRef({ within, onDismiss });
  latest.current = { within, onDismiss };

  useEffect(() => {
    if (!active) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      /* 이미 화면에서 떨어져 나간 노드는 「바깥」이 아니다 — 방금 지워진 버튼을 누른 것이라
         그 동작 자체가 이 선택을 다루고 있다. */
      if (!target.isConnected) return;
      if (latest.current.within.some((r) => r.current?.contains(target))) return;
      latest.current.onDismiss();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [active]);
}
