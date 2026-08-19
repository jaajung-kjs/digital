import { create } from 'zustand';

/**
 * 저장하지 않은 변경이 있는 화면이 **손을 든다** — 셸이 그것을 보고 떠나기를 막는다.
 *
 * 지금까지 「떠나기 전에 묻기」는 화면 안에서만 있었다: 워크스페이스는 다른 변전소를 고를 때,
 * 카탈로그는 다른 항목을 고를 때 물었다. 그런데 **다른 메뉴로 넘어가는 길**에는 아무것도
 * 없어서, 설비 품목을 고치다 위쪽 메뉴를 누르면 아무 말 없이 사라졌다.
 *
 * 막는 자리는 하나여야 한다 — 화면마다 라우터를 가로채면 새 화면이 생길 때마다 빠뜨린다.
 * 화면은 「나는 N건이 안 저장됐다」만 말하고, 그것을 어떻게 막을지는 셸이 정한다.
 */
interface UnsavedState {
  /** 안 저장된 변경의 수 — 0이면 떠나도 좋다. */
  count: number;
  /** 화면이 자기 상태를 알린다. 떠날 때는 0으로 되돌린다. */
  mark: (count: number) => void;
}

export const useUnsaved = create<UnsavedState>((set) => ({
  count: 0,
  mark: (count) => set((cur) => (cur.count === count ? cur : { count })),
}));
