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
      const { within, onDismiss } = latest.current;
      /* **위에 뜬 상자 안을 누른 것은 바깥이 아니다.** 상자는 `body` 밑으로 나가 있으므로
         「안」으로 넘긴 판에는 결코 담기지 않는다 — 그대로 두면 고른 장비를 다루려고 연 상자를
         누르는 순간 그 선택이 풀려, 상자가 무엇을 두고 묻는지가 뒤에서 사라진다. 층이 쌓이면
         **아래 층은 듣지 않는다**(Esc 와 같은 규칙 — `keyboard.ts`).

         단 **제 상자는 예외**다: 상자 자신이 이 훅으로 바깥 누름을 판정하므로, 제 백드롭을
         누른 것은 「위 층」이 아니라 자기 바깥이다. 그 층이 내 「안」을 품고 있으면 내 층이다. */
      const el = target instanceof Element ? target : target.parentElement;
      const layer = el?.closest('[data-modal-overlay]');
      if (layer && !within.some((r) => r.current && layer.contains(r.current))) return;
      if (within.some((r) => r.current?.contains(target))) return;
      onDismiss();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [active]);
}
