/**
 * 줄 손잡이(지우기·잇기·열기)를 **손이 닿을 때만** 드러낸다 — 자리는 늘 차지한 채 투명도만 바뀐다(§1.7).
 *
 * 세 길이 다 열려야 한다:
 * - 마우스: 줄(`group`)에 손을 얹으면.
 * - 키보드: 그 줄 안에 초점이 들면(`group-focus-within`), 단추 자신에 초점이 들면(`focus-visible`).
 * - **터치**: 호버가 없는 기기(`hover: none`)에서는 늘 보인다. 안 그러면 태블릿에서는 그 단추가 영영 안 보인다
 *   (선번장의 「잇기」·지우개가 실제로 그랬다 — 누를 자리가 투명했다).
 *
 * 줄에 `group` 을 거는 것은 부르는 쪽이다.
 */
export const HOVER_REVEAL =
  'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100';
