/**
 * 입력 컨트롤 크기 — `Button` 의 size 와 같은 두 단계.
 *
 * 왜 prop 인가: 예전에는 조밀한 사이드패널이 `<Input className="py-0.5 text-sm">` 처럼
 * 공용 컴포넌트의 여백을 **호출부마다 직접 덮어썼다**(16곳). 그래서 같은 `Input` 이
 * 화면에 따라 26px 이기도 38px 이기도 했고, 어떤 곳은 `text-xs` 까지 내려가 타이포 규칙을
 * 벗어났다. "조밀한 컨트롤은 얼마나 조밀한가"를 여기서 한 번만 정한다.
 *
 * 글자는 두 단계 모두 `text-sm` — 입력값은 본문이고, 좁다고 더 작아지지 않는다.
 */
export type ControlSize = 'sm' | 'md';

/** 세로 여백만 다르다 — 가로는 좁아져도 글자가 테두리에 붙지 않을 만큼 남긴다. */
export const controlSizeClasses: Record<ControlSize, string> = {
  sm: 'px-2 py-1 text-sm',
  md: 'px-3 py-2 text-sm',
};
