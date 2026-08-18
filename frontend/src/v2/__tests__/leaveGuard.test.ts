import { describe, expect, it, vi } from 'vitest';
import { confirmDiscard } from '../leaveGuard';

const wc = (dirty: number) => {
  let count = dirty;
  return { dirtyCount: () => count, revert: vi.fn(() => { count = 0; }) };
};

describe('confirmDiscard', () => {
  it('고칠 것이 없으면 묻지 않고 떠난다', async () => {
    const ask = vi.fn();
    expect(await confirmDiscard(wc(0), ask)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  it('몇 건인지 물어본다 — 상자가 그 숫자를 적는다', async () => {
    const ask = vi.fn(async () => false);
    await confirmDiscard(wc(4), ask);
    expect(ask).toHaveBeenCalledWith(4);
  });

  it('아니라고 하면 그대로 남는다', async () => {
    const s = wc(4);
    expect(await confirmDiscard(s, async () => false)).toBe(false);
    expect(s.revert).not.toHaveBeenCalled();
  });

  /* 「사라집니다」에 예를 눌렀는데 4건이 그대로 남아 있던 버그가 여기 있었다 — 버리는 일이
     「다른 변전소를 새로 읽는」 부수 효과에 얹혀 있어서, 같은 변전소로 돌아오는 길에서는
     아무것도 버려지지 않았다. 묻는 쪽이 버려야 어느 길로 가든 그 말이 참이 된다. */
  it('예라고 하면 **여기서** 버린다 — 읽기가 뒤따르든 말든', async () => {
    const s = wc(4);
    expect(await confirmDiscard(s, async () => true)).toBe(true);
    expect(s.revert).toHaveBeenCalledOnce();
    expect(s.dirtyCount()).toBe(0);
  });
});
