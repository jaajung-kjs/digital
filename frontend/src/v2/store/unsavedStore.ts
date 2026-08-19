import { create } from 'zustand';
import type { DirtyWorkingCopy } from '../leaveGuard';

/**
 * 저장하지 않은 변경이 있는 화면이 **손을 든다** — 셸이 그것을 보고 떠나기를 막는다.
 *
 * 지금까지 「떠나기 전에 묻기」는 화면 안에서만 있었다: 워크스페이스는 다른 변전소를 고를 때,
 * 카탈로그는 다른 항목을 고를 때 물었다. 그런데 **다른 메뉴로 넘어가는 길**에는 아무것도
 * 없어서, 설비 품목을 고치다 위쪽 메뉴를 누르면 아무 말 없이 사라졌다.
 *
 * 막는 자리는 하나여야 한다 — 화면마다 라우터를 가로채면 새 화면이 생길 때마다 빠뜨린다.
 * 화면은 「나는 N건이 안 저장됐다」만 말하고, 그것을 어떻게 막을지는 셸이 정한다.
 *
 * **버리는 방법도 함께 맡긴다.** 처음에는 세는 것만 맡겼는데, 그러면 셸은 묻기만 하고 아무것도
 * 버리지 못한다 — 「변경 N건이 사라집니다」에 「이동」을 눌러도 워킹 카피(모듈 수준 저장소)는
 * 그대로 남아, 돌아왔다가 다시 나갈 때마다 같은 상자가 또 떴다. 상자가 거짓말을 한 것이다.
 * 묻는 쪽이 버릴 수 있어야 그 말이 참이 된다(`confirmDiscard`).
 */
interface UnsavedState {
  /** 안 저장된 변경의 수 — 0이면 떠나도 좋다. */
  count: number;
  /** 떠나기로 했을 때 그 변경을 버리는 일 — 손을 든 화면이 제 방법을 함께 준다. */
  discard: () => void;
  /** 화면이 자기 상태를 알린다. 떠날 때는 0으로 되돌린다. */
  mark: (count: number, discard: () => void) => void;
}

const NOTHING_TO_DISCARD = () => {};

export const useUnsaved = create<UnsavedState>((set) => ({
  count: 0,
  discard: NOTHING_TO_DISCARD,
  mark: (count, discard) =>
    set((cur) => (cur.count === count && cur.discard === discard ? cur : { count, discard })),
}));

/**
 * 지금 화면의 안 저장된 변경 — 워킹 카피와 **같은 모양**이라 같은 함수가 다룬다.
 *
 * 그래서 「메뉴를 옮길 때」와 「다른 변전소를 고를 때」가 한 규칙을 쓴다(`confirmDiscard`).
 */
export const unsavedGuard: DirtyWorkingCopy = {
  dirtyCount: () => useUnsaved.getState().count,
  revert: () => useUnsaved.getState().discard(),
};
