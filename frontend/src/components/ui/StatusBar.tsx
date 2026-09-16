import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * 화면 맨 아래 **상태표시줄** — 「지금 어디에 무엇이 켜져 있나」.
 *
 * CAD·GIS 업무 도구는 좌표·축척·스냅·선택 수를 화면 아래 띠에 상주시킨다. 그래야 손이
 * 판 위에 있는 동안 눈이 딴 데로 가지 않는다. 우리 평면도에는 배율 하나뿐이었고 그것도
 * 캔버스 위에 떠 있어서, 커서가 지금 몇 mm 자리에 있는지 알 길이 없었다.
 *
 * 칸은 1px 선으로 가른다 — 여백만으로 나누면 값이 길어질 때 어느 것이 어느 칸인지 흐려진다.
 */
export function StatusBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex h-[34px] shrink-0 items-center border-t border-line-strong bg-surface-2 px-3 text-xs text-content-muted',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * 상태표시줄의 한 칸 — 이름(흐리게) + 값(고정폭).
 *
 * 숫자는 `tabular-nums` 다. 좌표처럼 **매 순간 바뀌는 값**이 비례폭이면 자릿수가 바뀔 때마다
 * 칸 전체가 들썩인다.
 */
export function StatusItem({
  label, children, className,
}: {
  label?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('flex items-center gap-1.5 border-r border-line px-3 tabular-nums first:pl-0', className)}>
      {label && <span className="text-content-faint">{label}</span>}
      <span className="text-content">{children}</span>
    </span>
  );
}
