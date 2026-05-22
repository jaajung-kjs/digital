import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { throttle } from './throttle';

describe('throttle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('첫 호출은 즉시 실행', () => {
    const fn = vi.fn();
    const t = throttle(fn, 700);
    t();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('wait 안의 후속 호출은 무시', () => {
    const fn = vi.fn();
    const t = throttle(fn, 700);
    t();
    vi.advanceTimersByTime(300);
    t();
    vi.advanceTimersByTime(300);
    t();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('wait 경과 후 호출은 다시 실행', () => {
    const fn = vi.fn();
    const t = throttle(fn, 700);
    t();
    vi.advanceTimersByTime(700);
    t();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('인자를 그대로 전달', () => {
    const fn = vi.fn();
    const t = throttle(fn, 700);
    t('a', 1);
    expect(fn).toHaveBeenCalledWith('a', 1);
  });
});
