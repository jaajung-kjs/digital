/**
 * 입력 컨트롤 크기 — `Button` 의 size 와 같은 단계에 **표 셀** 하나가 더 있다.
 *
 * 왜 prop 인가: 예전에는 조밀한 사이드패널이 `<Input className="py-0.5 text-sm">` 처럼
 * 공용 컴포넌트의 여백을 **호출부마다 직접 덮어썼다**(16곳). 그래서 같은 `Input` 이
 * 화면에 따라 26px 이기도 38px 이기도 했고, 어떤 곳은 `text-xs` 까지 내려가 타이포 규칙을
 * 벗어났다. "조밀한 컨트롤은 얼마나 조밀한가"를 여기서 한 번만 정한다.
 *
 * 글자는 모든 단계가 `text-sm` — 입력값은 본문이고, 좁다고 더 작아지지 않는다.
 *
 * `cell` 은 **표 본문 안**에서 값을 고칠 때다(선번장·계통·케이블 품목). 표는 이미 제 배경을
 * 갖고 있어서 칸마다 상자가 또 깔리면 행이 아니라 상자 벽으로 읽힌다 — 그래서 `Input` 은 이
 * 크기에서 배경을 비운다(색은 여백이 아니라 컨트롤이 정한다). 예전에는 이 밀도가
 * `!bg-transparent !px-1` 처럼 `!important` 로 덮여 있었다.
 */
export type ControlSize = 'sm' | 'md' | 'cell';

/** 세로 여백만 다르다 — 가로는 좁아져도 글자가 테두리에 붙지 않을 만큼 남긴다. */
export const controlSizeClasses: Record<ControlSize, string> = {
  sm: 'px-2 py-1 text-sm',
  md: 'px-3 py-2 text-sm',
  cell: 'px-1 py-0.5 text-sm',
};
