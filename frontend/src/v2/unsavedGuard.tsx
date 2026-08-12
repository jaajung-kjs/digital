import { createContext, useContext, useEffect, useRef, type ReactNode, type MutableRefObject } from 'react';

/**
 * 저장하지 않은 변경이 있는지 — **화면이 알리고, 그 화면을 떠나보내는 쪽이 묻는다**.
 *
 * 왜 필요한가: 편집 화면과 「떠나는 길」의 주인이 다르다. 초안은 각 패널이 들고 있는데
 * 탭을 옮기는 것은 페이지다. 그래서 탭을 옮기면 패널이 통째로 사라지고 초안이 조용히
 * 날아갔다 — 실측으로 이름을 고친 뒤 탭을 옮겼다 오면 묻지도 않고 원래 값이었다.
 *
 * 값을 위로 끌어올리지 않는 이유: 초안의 모양이 화면마다 다르고(설비·자산·케이블), 페이지가
 * 알아야 하는 것은 「고친 게 있나」 하나뿐이다. 그 한 줄만 올린다.
 *
 * 한 번에 한 화면만 서 있으므로 자리는 하나다. 화면이 사라질 때 스스로 지운다.
 */
const DirtyRef = createContext<MutableRefObject<boolean> | null>(null);

export function UnsavedGuardProvider({ children }: { children: ReactNode }) {
  const ref = useRef(false);
  return <DirtyRef.Provider value={ref}>{children}</DirtyRef.Provider>;
}

/** 이 화면에 저장 안 한 변경이 있음을 알린다. */
export function useReportUnsaved(dirty: boolean): void {
  const ref = useContext(DirtyRef);
  useEffect(() => {
    if (!ref) return;
    ref.current = dirty;
    return () => {
      ref.current = false;
    };
  }, [dirty, ref]);
}

/** 지금 서 있는 화면에 저장 안 한 변경이 있는가 — 떠나보내기 전에 묻는다. */
export function useHasUnsaved(): () => boolean {
  const ref = useContext(DirtyRef);
  return () => ref?.current ?? false;
}
