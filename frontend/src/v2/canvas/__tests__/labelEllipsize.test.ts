import { describe, it, expect } from 'vitest';
import { ellipsize } from '../renderers';

/**
 * 캔버스 자산 라벨은 상자를 못 넘는다.
 * 예전에는 6px 까지 줄인 뒤 `fillText` 의 maxWidth 로 **가로만 눌러 담아** 긴 이름이
 * 17% 찌그러졌다(측정값) — 글자를 알아볼 수 없었고, 화면의 다른 목록이 전부 말줄임하는
 * 것과도 어긋났다.
 */
function fakeCtx(charWidth: number): CanvasRenderingContext2D {
  return { measureText: (t: string) => ({ width: t.length * charWidth }) } as CanvasRenderingContext2D;
}

describe('자산 라벨 말줄임', () => {
  it('들어가면 그대로 둔다', () => {
    expect(ellipsize(fakeCtx(10), '랙A', 100)).toBe('랙A');
  });

  it('넘치면 잘라 … 를 붙인다 — 결과는 반드시 폭 안', () => {
    const ctx = fakeCtx(10);
    const out = ellipsize(ctx, '아주아주긴자산이름', 50); // 5글자 분량
    expect(out.endsWith('…')).toBe(true);
    expect(ctx.measureText(out).width).toBeLessThanOrEqual(50);
  });

  it('한 글자도 못 넣을 만큼 좁으면 … 만 남긴다 — 빈 문자열이 되지 않게', () => {
    expect(ellipsize(fakeCtx(10), '이름', 5)).toBe('…');
  });
});
