/**
 * 키를 읽는 규칙 — **한 군데에서만 적는다**.
 *
 * Esc 를 듣는 자리가 다섯인데 서로를 모르고 있었다: 어떤 곳은 `e.key`, 어떤 곳은 `e.code`
 * 로 봤고(둘은 자판 배열에 따라 갈릴 수 있다), 「지금 글자를 치는 중인가」를 가리는 방법도
 * 세 가지였으며 한 곳((옛) 구성 격자)에는 아예 없었다. 그래서 칸에 값을 적다 Esc 를 누르면
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
 * 있었다. 그래서 (옛) 구성 격자에서 장비 상자를 열고 Esc 를 누르면 상자가 닫히면서 **고른 설비까지
 * 풀려** 상세 패널이 통째로 사라졌다 — 물린 것이 하나인데 둘이 물린 셈이다.
 *
 * 「Esc 는 가장 위 층의 것」은 층이 쌓이는 화면의 표준(WAI-ARIA APG Dialog)이므로, 층을
 * 세는 일을 **여기 한 번만** 적는다. `<dialog>` 가 아니라 div 로 그리므로 `:modal` 대신
 * 상자가 스스로 붙이는 표(`data-modal-overlay`)를 본다 — `role` 로 보면 묻는 상자
 * (`alertdialog`)를 놓친다.
 */
function modalIsOpen(): boolean {
  return typeof document !== 'undefined' && document.querySelector('[data-modal-overlay]') != null;
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

/**
 * 조합 중인 키인가 — **한글·일본어·중국어를 치는 중**이면 그 키는 IME 의 것이다.
 *
 * 한글을 치다 Enter 를 누르면 keydown 이 **두 번** 온다: 먼저 조합을 끝내는 Enter(그때
 * `isComposing` 이 참이고, 브라우저에 따라 `keyCode` 가 229 다), 그다음 진짜 Enter.
 * 둘을 가리지 않으면 **한 번 누른 것이 두 번 실행된다** — 층을 만들면 「이미 같은 이름이
 * 있습니다」가 뜨는데 층은 만들어져 있었다(첫 요청은 성공하고 둘째가 409 로 돌아온 것이다).
 * Esc 도 마찬가지다: 조합을 물리려고 누른 Esc 가 상자까지 닫아 버린다.
 */
export function isComposing(e: NativeOrReactKey): boolean {
  const native = 'nativeEvent' in e ? e.nativeEvent : e;
  return native.isComposing || native.keyCode === 229;
}

/** React 합성 이벤트와 네이티브 이벤트를 함께 받는다 — 같은 규칙이 양쪽에 필요하다. */
type NativeOrReactKey = KeyboardEvent | { key: string; nativeEvent: KeyboardEvent };

/**
 * 「이 Enter 는 **확정**인가」 — 글자를 조합하는 중이면 아니다.
 *
 * 값을 확정하는 자리(칸에서 Enter)는 앱에 열세 곳이 있고, 전부 `e.key === 'Enter'` 만 보고
 * 있었다. 한글을 쓰는 화면에서 그 열세 곳이 모두 두 번 실행되고 있었다는 뜻이다.
 */
export function isCommitKey(e: NativeOrReactKey): boolean {
  return e.key === 'Enter' && !isComposing(e);
}
