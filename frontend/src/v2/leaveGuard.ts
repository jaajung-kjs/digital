/**
 * **저장하지 않은 변경을 두고 떠날 때** — 묻고, 버린다. 한 곳에서.
 *
 * 예전에는 묻기만 했다. 버리는 일은 「다른 변전소를 새로 읽는」 부수 효과에 얹혀 있었는데,
 * 그 읽기는 **대상이 달라졌을 때만** 일어난다. 그래서 지사를 한 번 거쳐 같은 변전소로
 * 돌아오면 다시 읽지 않고, 「변경 4건이 사라집니다」에 「이동」을 눌러도 4건이 그대로 남았다.
 * 상자가 거짓말을 한 셈이다.
 *
 * 묻는 쪽이 버려야 그 말이 어느 길로 가든 참이 된다.
 */
export interface DirtyWorkingCopy {
  dirtyCount: () => number;
  revert: () => void;
}

/**
 * 떠나도 되는가. `true` 면 떠난다(변경이 있었다면 이미 버려진 뒤다).
 *
 * @param ask 사람에게 묻는다 — 몇 건이 사라지는지 받아서 확인 상자를 띄운다.
 */
export async function confirmDiscard(
  wc: DirtyWorkingCopy,
  ask: (dirtyCount: number) => Promise<boolean>,
): Promise<boolean> {
  const dirty = wc.dirtyCount();
  if (dirty === 0) return true;
  if (!(await ask(dirty))) return false;
  wc.revert();
  return true;
}
