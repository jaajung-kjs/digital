import type { KeyboardEvent } from 'react';

/**
 * **고른 것을 다시 누르면 풀린다.** 앱 전체가 이 한 줄을 따른다.
 *
 * 규칙 자체는 예전에도 있었지만 `setX((cur) => (cur === id ? null : id))` 를 손으로 베껴
 * 쓰는 방식이었다 — 케이블 품목 표·구성 격자·장비 목록에는 붙었고, 정작 가장 많이 쓰는
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
/**
 * **가지 줄을 다시 누르면 접힌다** — 놓이는 것이 아니라.
 *
 * 하위를 품은 줄(조직의 본부·지사, 현황표의 설비 묶음)은 「갈 곳」이면서 동시에 「담는
 * 것」이다. 그런 줄에서 재클릭이 선택 해제를 뜻하면, 폴더를 다시 눌러 접기를 기대한
 * 사람에게는 화면이 엉뚱하게 반응한다(VS Code 탐색기가 그 감각의 기준이다).
 *
 * 그래서 재클릭의 뜻을 줄의 성격이 정한다:
 * - **잎**(변전소·종류·자산 한 대) → 다시 누르면 **놓는다**
 * - **가지**(본부·지사·설비 묶음) → 다시 누르면 **접거나 편다**. 놓는 일은 빈 곳·Esc 가 맡는다
 *
 * 아직 안 고른 가지를 누르면 고르면서 펴 준다 — 고른 것의 속을 보여 주는 것이 자연스럽다.
 */
export function selectOrToggle({
  selected,
  branch,
  select,
  deselect,
}: {
  selected: boolean;
  /** 하위를 품은 줄이면 준다. 없으면 잎이다. */
  branch?: { collapsed: boolean; setCollapsed: (next: boolean) => void };
  select: () => void;
  deselect: () => void;
}) {
  if (!selected) {
    select();
    if (branch?.collapsed) branch.setCollapsed(false);
    return;
  }
  if (branch) {
    branch.setCollapsed(!branch.collapsed);
    return;
  }
  deselect();
}

export function selectableRow(
  current: string | null,
  id: string,
  onSelect: (next: string | null) => void,
  /** 하위를 품은 줄이면 준다 — 재클릭이 「놓기」가 아니라 「접기」가 된다. */
  branch?: { collapsed: boolean; setCollapsed: (next: boolean) => void },
) {
  const selected = current === id;
  const toggle = () =>
    selectOrToggle({ selected, branch, select: () => onSelect(id), deselect: () => onSelect(null) });
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
