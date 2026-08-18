/**
 * 키를 읽는 규칙 — **한 군데에서만 적는다**.
 *
 * Esc 를 듣는 자리가 다섯인데 서로를 모르고 있었다: 어떤 곳은 `e.key`, 어떤 곳은 `e.code`
 * 로 봤고(둘은 자판 배열에 따라 갈릴 수 있다), 「지금 글자를 치는 중인가」를 가리는 방법도
 * 세 가지였으며 한 곳(구성 격자)에는 아예 없었다. 그래서 칸에 값을 적다 Esc 를 누르면
 * 화면마다 다른 일이 일어났다.
 */

/** 지금 글자를 치는 중인가 — 그렇다면 그 키는 **그 칸의 것**이다(입력 취소·목록 닫기). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * **위에 대화상자가 떠 있나** — 그렇다면 Esc 는 그 상자의 것이다.
 *
 * 상자는 자기 Esc 를 스스로 듣는데(`Modal`), 뒤에 깔린 화면들도 window 에서 같은 키를 듣고
 * 있었다. 그래서 구성 격자에서 부품 상자를 열고 Esc 를 누르면 상자가 닫히면서 **고른 자산까지
 * 풀려** 상세 패널이 통째로 사라졌다 — 물린 것이 하나인데 둘이 물린 셈이다.
 *
 * 「Esc 는 가장 위 층의 것」은 층이 쌓이는 화면의 표준(WAI-ARIA APG Dialog)이므로, 층을
 * 세는 일을 **여기 한 번만** 적는다. `<dialog>` 가 아니라 div 로 그리므로 `:modal` 대신
 * 상자가 스스로 붙이는 표(`role="dialog" aria-modal`)를 본다.
 */
function modalIsOpen(): boolean {
  return typeof document !== 'undefined' && document.querySelector('[role="dialog"][aria-modal="true"]') != null;
}

/**
 * 「지금 하던 것을 물린다」 — Esc.
 *
 * 글자를 치는 중이면 가로채지 않고, 위에 대화상자가 떠 있으면 그 상자에 양보한다.
 * `e.code` 가 아니라 `e.key` 로 본다.
 */
export function isCancelKey(e: KeyboardEvent): boolean {
  return e.key === 'Escape' && !isTypingTarget(e.target) && !modalIsOpen();
}
