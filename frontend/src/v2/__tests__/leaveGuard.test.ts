import { describe, expect, it, vi } from 'vitest';
import { confirmDiscard } from '../leaveGuard';
import { useUnsaved, unsavedGuard } from '../store/unsavedStore';

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

/**
 * 셸이 메뉴를 옮길 때 보는 것 — 화면이 손을 든 그 변경이다.
 *
 * 셸은 세는 것만 알고 버릴 줄은 몰랐다. 그래서 「변경 N건이 사라집니다」에 「이동」을 눌러도
 * 워킹 카피(모듈 수준 저장소)는 그대로 남았고, 설비 관리 ↔ 설비 품목을 오갈 때마다 같은
 * 상자가 다시 떴다. 손드는 화면이 **버리는 방법까지** 함께 맡긴다.
 */
describe('unsavedGuard — 화면이 손든 변경', () => {
  it('아무도 손들지 않았으면 묻지 않는다', async () => {
    useUnsaved.getState().mark(0, () => {});
    const ask = vi.fn();
    expect(await confirmDiscard(unsavedGuard, ask)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  it('이동하면 그 화면의 방법으로 버린다 — 다시 물을 것이 남지 않는다', async () => {
    const discard = vi.fn(() => useUnsaved.getState().mark(0, () => {}));
    useUnsaved.getState().mark(3, discard);

    const ask = vi.fn(async () => true);
    expect(await confirmDiscard(unsavedGuard, ask)).toBe(true);
    expect(ask).toHaveBeenCalledWith(3);
    expect(discard).toHaveBeenCalledOnce();
    /* 두 번째 길에서는 물을 것이 없다 — 첫 번째에서 정말 버렸으니까. */
    expect(await confirmDiscard(unsavedGuard, ask)).toBe(true);
    expect(ask).toHaveBeenCalledOnce();
  });

  it('취소하면 아무것도 버리지 않는다', async () => {
    const discard = vi.fn();
    useUnsaved.getState().mark(2, discard);
    expect(await confirmDiscard(unsavedGuard, async () => false)).toBe(false);
    expect(discard).not.toHaveBeenCalled();
    expect(useUnsaved.getState().count).toBe(2);
  });
});
