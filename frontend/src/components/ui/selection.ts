/**
 * 선택 상태의 생김새 — 목록·표·타일이 "고른 것"을 같은 방식으로 나타내게 하는 단일 지점.
 *
 * 예전에는 네 곳이 각자 정했다:
 *   조직트리 `bg-surface-2 text-primary` / 타입목록 `bg-info-bg text-primary font-medium`
 *   현황표 `bg-surface-2` / 슬롯타일 `border-primary bg-primary/10`
 * 특히 현황표는 **선택과 호버가 같은 클래스**여서 어느 행을 골랐는지 알 수 없었다.
 *
 * 규칙: 호버는 표면색만 바뀌고(`SELECTABLE`), 선택은 강조색 배경 + 굵기로 확실히 구분한다
 * (`SELECTED`). 둘이 같은 색을 쓰지 않는 것이 핵심이다.
 */

/** 고를 수 있는 항목의 기본 상태 — 호버에만 반응한다. */
export const SELECTABLE = 'cursor-pointer transition-colors hover:bg-surface-2';

/**
 * 골라진 항목 — 호버색과 겹치지 않는 강조색.
 *
 * `hover:` 를 함께 적는 이유: `SELECTABLE` 의 `hover:bg-surface-2` 는 의사클래스라
 * 그냥 `bg-info-bg` 보다 **우선순위가 높다**. 그래서 고른 행에 커서를 올리면 선택색이
 * 호버 회색에 덮여, 정작 보고 있는 순간에 어느 것을 골랐는지 알 수 없었다.
 * 고른 항목은 호버 피드백이 필요 없다 — 이미 표시돼 있다.
 *
 * 확실히 먹는 신호는 **배경과 굵기**다. `text-primary` 는 셀이 제 글자색을 지정하지 않은
 * 곳(조직트리·타입목록)에서만 적용된다 — 표의 `<td>` 는 열마다 색을 정하므로 덮인다.
 */
export const SELECTED = 'bg-info-bg font-medium text-primary hover:bg-info-bg';

/** 테두리가 있는 타일(슬롯·포트 등)에서 골라진 상태. */
export const SELECTED_TILE = 'border-primary bg-info-bg font-medium text-primary hover:bg-info-bg';
