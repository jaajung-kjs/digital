import { describe, expect, it } from 'vitest';
import { backingSize } from '../backingStore';

/* 뒤판을 CSS 크기 그대로 잡으면 레티나에서 절반만 그려 놓고 두 배로 늘리는 셈이라 격자가
   뿌옇게 번진다. 이 한 줄이 어긋나면 화면 전체의 선명도가 조용히 반으로 준다. */
describe('backingSize', () => {
  it('화면 배율만큼 크게 잡는다', () => {
    expect(backingSize(830, 603, 2)).toEqual({ width: 1660, height: 1206 });
  });

  it('배율이 1이면 보이는 크기 그대로다', () => {
    expect(backingSize(830, 603, 1)).toEqual({ width: 830, height: 603 });
  });

  /* 소수 배율(125% 확대 등)도 있다 — 픽셀은 정수여야 한다. */
  it('소수 배율은 반올림한다', () => {
    expect(backingSize(100, 100, 1.25)).toEqual({ width: 125, height: 125 });
    expect(backingSize(101, 101, 1.5)).toEqual({ width: 152, height: 152 });
  });

  /* 아직 자리를 못 잡은 순간(0×0)에도 캔버스는 만들어져야 한다. */
  it('0 은 캔버스가 될 수 없으므로 최소 1이다', () => {
    expect(backingSize(0, 0, 2)).toEqual({ width: 1, height: 1 });
  });
});
