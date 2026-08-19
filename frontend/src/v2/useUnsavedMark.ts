import { useEffect } from 'react';
import { useUnsaved } from './store/unsavedStore';

/**
 * 이 화면에 안 저장된 변경이 몇 건인지 셸에 알린다 — 화면이 사라지면 스스로 거둔다.
 *
 * 거두지 않으면 편집을 떠난 뒤에도 셸이 계속 막는다(그 화면은 이미 없는데).
 */
export function useUnsavedMark(count: number): void {
  const mark = useUnsaved((s) => s.mark);
  useEffect(() => {
    mark(count);
  }, [count, mark]);
  useEffect(() => () => mark(0), [mark]);
}
