import type { KeyboardEvent } from 'react';

/**
 * 누르면 골라지는 **표의 한 줄** — 마우스만이 아니라 키보드로도 닿게 한다.
 *
 * 행이 `<tr onClick>` 뿐이었다. `tabIndex` 도 `aria-selected` 도 Enter 처리도 없어서,
 * 키보드만 쓰는 사람은 현황·선번장·계통 어느 표에서도 아무것도 고를 수 없었다
 * (WCAG 2.1 SC 2.1.1). 웹접근성 품질인증은 공공기관 조달 요건이기도 하다.
 *
 * 세 표가 각자 같은 속성을 손으로 붙이면 하나만 빠지는 것은 시간 문제라 여기 한 번만 적는다:
 *
 *     <tr {...selectableRow(isSelected, () => onSelect(id))} className={…}>
 *
 * 셀 안의 입력칸을 누르는 것까지 행 선택으로 삼지 않도록, 키 처리는 **행 자신이 초점을
 * 가졌을 때만** 반응한다 — 안 그러면 칸에 값을 적고 Enter 를 치는 순간 행이 함께 골라진다.
 */
export function selectableRow(selected: boolean, onSelect: () => void) {
  return {
    tabIndex: 0,
    'aria-selected': selected,
    onClick: onSelect,
    onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      onSelect();
    },
  };
}
