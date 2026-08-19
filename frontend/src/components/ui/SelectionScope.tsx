import { forwardRef, useEffect, type HTMLAttributes } from 'react';
import { isCancelKey } from './keyboard';

/**
 * 이 안에서 고른 것은 이 안에서 푼다 — **선택의 주인**을 한 번만 선언한다.
 *
 * 「고른 것을 놓는 방법」이 네 군데에 손으로 흩어져 있었다: 표는 스크롤 여백을 누르면
 * 풀리는데 트리 여백은 안 풀리고, Esc 는 설비 관리에만 있었다. 그래서 「해제가 잘 안
 * 된다」는 느낌이 남았다 — 실제로 걸리는 자리가 두 곳뿐이었다.
 *
 * **주인 안의 빈 곳을 누르면 풀린다.** 항목(`data-selectable`)이나 누를 수 있는 것(입력칸·
 * 단추·링크) 위가 아니면 빈 곳이다.
 *
 * **주인 밖은 건드리지 않는다.** 편집 바의 「저장」·「종류 삭제」와 상세 패널은 *고른 것에
 * 대해* 동작한다 — 누르는 순간 풀리면 대상을 잃는다. Finder·Figma·VS Code 가 같은 규칙을
 * 쓰는 까닭이다(도구바를 눌러도 선택은 남는다).
 *
 * **평면도는 예외다.** 거기서는 그린 도형이 DOM 이 아니라 캔버스 픽셀이라, 「항목 위인가」를
 * 좌표로 따져야 한다. 그리고 같은 포인터 손짓이 끌기·훑기와도 겹친다. 그래서 평면도는 제
 * 손으로 판단한다 — 중복이 아니라 다른 문제다.
 */
export const SelectionScope = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & {
  onClear: () => void;
  /**
   * Esc 로도 푼다 — **화면마다 하나만** 준다.
   *
   * 설비 관리에는 선택이 둘이다(조직 노드 · 자산). Esc 가 둘 다 풀면 변전소 밖으로
   * 튕겨 나가므로, 지금 일하고 있는 쪽만 받는다.
   */
  escapes?: boolean;
  }
>(function SelectionScope({ onClear, escapes = false, children, ...rest }, ref) {
  useEffect(() => {
    if (!escapes) return;
    const onKey = (e: KeyboardEvent) => {
      if (isCancelKey(e)) onClear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [escapes, onClear]);

  return (
    <div
      ref={ref}
      onPointerDown={(e) => {
        const el = e.target as HTMLElement | null;
        /* 항목 위도, 누를 수 있는 것 위도 아니면 빈 곳이다. 검색칸·`+` 단추를 누를 때
           선택이 풀리면 안 되므로 상호작용 요소는 모두 비켜 간다. */
        if (el?.closest('[data-selectable], input, textarea, select, button, a, [role="menu"], [data-keep-selection]'))
          return;
        onClear();
      }}
      {...rest}
    >
      {children}
    </div>
  );
});
