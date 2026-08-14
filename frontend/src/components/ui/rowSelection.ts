import type { KeyboardEvent } from 'react';

/**
 * **고른 것을 다시 누르면 풀린다.** 앱 전체가 이 한 줄을 따른다.
 *
 * 규칙 자체는 예전에도 있었지만 `setX((cur) => (cur === id ? null : id))` 를 손으로 베껴
 * 쓰는 방식이었다 — 케이블 종류 표·구성 격자·부품 목록에는 붙었고, 정작 가장 많이 쓰는
 * 현황·선번장·계통에는 빠졌다. 한 번 고르면 풀 방법이 없는 표가 남은 이유다.
 * 규칙을 부르는 자리마다 다시 적으면 빠뜨리는 자리가 생긴다.
 *
 * 키보드로도 닿는다: 행이 `<tr onClick>` 뿐이라 키보드만 쓰는 사람은 어느 표에서도
 * 아무것도 고를 수 없었다(WCAG 2.1 SC 2.1.1).
 *
 *     <tr {...selectableRow(selectedId, row.id, onSelect)} className={…}>
 *
 * 셀 안의 입력칸에서 친 Enter 가 행 선택으로 새지 않도록, 키 처리는 **행 자신이 초점을
 * 가졌을 때만** 반응한다.
 */
export function selectableRow(current: string | null, id: string, onSelect: (next: string | null) => void) {
  const selected = current === id;
  const toggle = () => onSelect(selected ? null : id);
  return {
    /* 「이건 항목이다」 — 빈 곳 클릭으로 푸는 규칙이 이 표시를 본다(`SelectionScope`). */
    'data-selectable': '',
    tabIndex: 0,
    'aria-selected': selected,
    onClick: toggle,
    onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      toggle();
    },
  };
}
