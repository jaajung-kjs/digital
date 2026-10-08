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
