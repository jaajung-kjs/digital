/**
 * 캔버스의 **뒤판 크기** — 보이는 크기가 아니라 실제로 그려 넣을 픽셀 수.
 *
 * `<canvas>` 는 크기를 둘 갖는다: CSS 가 정하는 **보이는 크기**와 `width`/`height` 속성이 정하는
 * **뒤판 크기**. 둘이 다르면 브라우저가 뒤판을 늘리거나 줄여 보여 준다. 뒤판을 CSS 크기로 잡으면
 * 화면 배율이 2인 기기에서 **실제 픽셀의 절반만 그려 놓고 두 배로 늘리는** 셈이라, 격자선과
 * 글자가 뿌옇게 번진다. 배율만큼 크게 잡고, 그리는 쪽에서 그만큼 되돌린다(`setTransform`).
 */
export interface BackingSize {
  width: number;
  height: number;
}

/** 보이는 크기와 화면 배율 → 뒤판 크기. 0 은 캔버스가 될 수 없으므로 최소 1이다. */
export function backingSize(cssWidth: number, cssHeight: number, dpr: number): BackingSize {
  const scale = dpr > 0 ? dpr : 1;
  return {
    width: Math.max(1, Math.round(cssWidth * scale)),
    height: Math.max(1, Math.round(cssHeight * scale)),
  };
}
