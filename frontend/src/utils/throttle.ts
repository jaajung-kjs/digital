/**
 * Leading-edge throttle — 첫 호출은 즉시 실행하고, 이후 `wait` ms 동안의 호출은
 * 무시한다(trailing 없음). zundo handleSet 에 써서 드래그 한 제스처(매 프레임 set)를
 * history 항목 1개로 합친다 — 버스트의 *첫* 상태를 잡으므로 undo 가 제스처 전체를
 * 되돌린다.
 */
export function throttle<F extends (...args: never[]) => void>(fn: F, wait: number): F {
  let last = 0;
  return ((...args: never[]) => {
    const now = Date.now();
    if (now - last >= wait) {
      last = now;
      fn(...args);
    }
  }) as F;
}
