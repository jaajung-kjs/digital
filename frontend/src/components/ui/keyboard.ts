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
 * 「지금 하던 것을 물린다」 — Esc.
 *
 * 글자를 치는 중이면 가로채지 않는다. `e.code` 가 아니라 `e.key` 로 본다.
 */
export function isCancelKey(e: KeyboardEvent): boolean {
  return e.key === 'Escape' && !isTypingTarget(e.target);
}
