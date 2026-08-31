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
    ref.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selectedKey]);
  return ref;
}
