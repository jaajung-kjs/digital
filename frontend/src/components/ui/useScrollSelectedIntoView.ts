import { useEffect, useRef } from 'react';

/**
 * **고른 줄을 화면 안으로** — 색만 바뀌고 화면 밖에 그대로 있으면 아무 일도 안 한 것처럼 보인다.
 *
 * 상세 패널에서 고른 것이 지금 보고 있는 표(현황·선번장·계통)에도 있으면, 선택 효과만으로는
 * 부족하다: 스무 줄쯤 아래에 있으면 그 줄이 색칠됐다는 사실 자체를 알 수 없다.
 *
 * **표마다 새로 적을 것이 없다.** 어느 줄이 골라졌는지는 표가 이미 표시해 두었다 —
 * `selectableRow` 가 모든 고를 수 있는 줄에 `aria-selected` 를 단다(그것이 스크린리더에게
 * 말하는 방식이기도 하다). 그 표시를 찾아 옮기면 된다.
 *
 * **고른 것이 바뀔 때만** 옮긴다. 그리기마다 옮기면 사람이 표를 굴려 다른 데를 보고 있어도
 * 화면이 자꾸 되돌아와 읽을 수가 없다.
 *
 *     const scrollRef = useScrollSelectedIntoView(selectedPortId);
 *     <div ref={scrollRef}>…표…</div>
 *
 * `block: 'nearest'` 라 이미 보이는 줄은 건드리지 않는다 — 보이지 않을 때만 딱 그만큼 굴린다.
 */
export function useScrollSelectedIntoView<T extends HTMLElement = HTMLDivElement>(
  selectedKey: string | null,
) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (selectedKey == null) return;
    const row = ref.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!row) return;
    /* 표 머리글은 `sticky` 라 스크롤 상자 안에 떠 있다 — 그걸 모르는 채로 옮기면 줄이 머리글
       **아래로 밀려 들어가** 정작 안 보인다. 머리글 높이만큼 여백을 주면 그만큼 위에서
       멈춘다. 스크롤 값을 손으로 계산하지 않는 까닭은 그 일을 CSS 가 이미 맡고 있어서다
       (`scroll-margin`). 높이는 재서 쓴다 — 머리글이 한 줄인지 두 줄인지는 표마다 다르다. */
    const head = row.closest('table')?.querySelector('thead tr');
    const stuck = head && getComputedStyle(head).position === 'sticky'
      ? head.getBoundingClientRect().height
      : 0;
    row.style.scrollMarginTop = `${stuck}px`;
    row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selectedKey]);
  return ref;
}
