import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { cn } from './cn';

/**
 * 일하는 동안 **판을 잠근다** — 저장이 서버에 가 있는 동안 고치지 못하게.
 *
 * 저장 중에 고친 것은 저장이 끝나며 변경안을 비울 때 **말없이 사라졌다**(보낸 본문에는 없고,
 * 비우는 것은 전부다). 고치는 손을 받아 두었다가 버리느니, 처음부터 받지 않는다.
 *
 * 덮개만으로는 막히지 않는다 — Tab 으로 칸에 들어가 칠 수 있다. 그래서 감싼 판을 `inert` 로
 * 들어내고(초점·클릭·읽기에서 빠진다, `Modal` 과 같은 수단), 덮개는 그 **바깥** 형제로 서서
 * 「저장 중…」이 읽히게 한다.
 */
export function BusyOverlay({ busy, label, children, className }: { busy: boolean; label: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  /* React 18 은 `inert` 속성을 모른다 — DOM 에 직접 건다(`Modal` 과 같다). */
  useLayoutEffect(() => {
    if (ref.current) ref.current.inert = busy;
  }, [busy]);
  return (
    <div className={cn('relative flex min-h-0 min-w-0 flex-1', className)} aria-busy={busy || undefined}>
      <div ref={ref} className="flex min-h-0 min-w-0 flex-1" data-testid="busy-scope">{children}</div>
      {busy && (
        <div role="status" className="absolute inset-0 z-panel flex cursor-wait items-center justify-center bg-surface/60 text-sm text-content-muted">
          {label}
        </div>
      )}
    </div>
  );
}
