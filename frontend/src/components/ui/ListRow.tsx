import type { ReactNode } from 'react';
import { cn } from './cn';
import { SELECTABLE } from './selection';

/**
 * 카드 안 목록의 한 줄 — 이름 하나를 읽고, `onClick` 을 주면 누를 수 있다(랙 안의 설비 목록).
 * 긴 이름은 잘리고(`truncate`), 누를 수 있는 줄은 선택 가능한 표면의 호버를 쓴다.
 */
export function ListRow({ children, onClick, className }: { children: ReactNode; onClick?: () => void; className?: string }) {
  const base = 'block w-full truncate rounded px-1 text-left text-sm text-content';
  if (!onClick) return <div className={cn(base, className)}>{children}</div>;
  return <button type="button" className={cn(base, SELECTABLE, className)} onClick={onClick}>{children}</button>;
}
