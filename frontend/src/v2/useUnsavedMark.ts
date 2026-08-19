import { useEffect, useRef } from 'react';
import { useUnsaved } from './store/unsavedStore';

/**
 * 이 화면에 안 저장된 변경이 몇 건인지, **떠나기로 하면 어떻게 버리는지** 셸에 알린다 —
 * 화면이 사라지면 스스로 거둔다.
 *
 * 거두지 않으면 편집을 떠난 뒤에도 셸이 계속 막는다(그 화면은 이미 없는데).
 */
export function useUnsavedMark(count: number, discard: () => void): void {
  const mark = useUnsaved((s) => s.mark);
  /* 버리는 방법은 늘 **지금 것**을 부른다 — 그 함수의 정체가 렌더마다 달라져도 손드는 일을
     다시 만들지 않는다(세는 수가 달라질 때만 알린다). */
  const latest = useRef(discard);
  latest.current = discard;
  useEffect(() => {
    mark(count, () => latest.current());
  }, [count, mark]);
  useEffect(() => () => mark(0, () => {}), [mark]);
}
