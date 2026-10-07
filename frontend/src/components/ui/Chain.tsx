import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

/**
 * **세로 사슬** — 차례대로 이어지는 것(중계경로: 설비 → 코어 → 광선로 → 중계 패치 → … → 설비)을 위에서 아래로.
 *
 * 왼쪽에 선 하나가 흐르고, 마디(`node` — 국·설비·코어 끝)는 그 선 위에 점을 찍는다. 마디 사이를 잇는 것
 * (`link` — 광선로·중계 패치)은 점 없이 한 단 흐린 메타 글자다: 읽는 눈은 점만 따라가면 「어디를 지나는가」를,
 * 그 사이를 읽으면 「무엇으로 건너는가」를 얻는다. 끊긴 자리(`warning`)는 경고색 점과 글자.
 */
export function Chain({ className, children, ...rest }: HTMLAttributes<HTMLOListElement>) {
  return (
    <ol className={cn('ml-1 border-l border-line-strong', className)} {...rest}>
      {children}
    </ol>
  );
}

export type ChainStepTone = 'node' | 'link' | 'warning';

export function ChainStep({ tone = 'node', className, children, ...rest }: HTMLAttributes<HTMLLIElement> & { tone?: ChainStepTone }) {
  return (
    <li
      className={cn(
        'relative min-w-0 py-1 pl-4',
        tone === 'link' ? 'text-xs text-content-muted' : 'text-sm',
        tone === 'warning' && 'text-warning',
        className,
      )}
      {...rest}
    >
      {tone !== 'link' && (
        <span
          aria-hidden
          className={cn('absolute -left-1 top-2.5 h-2 w-2 rounded-full', tone === 'warning' ? 'bg-lamp-warning' : 'bg-primary')}
        />
      )}
      {children}
    </li>
  );
}

/** 사슬 안의 **다른 곳으로 가는** 글자(국 이름·코어 → 그 국 선번장). 쉴 때는 글자, 손을 얹으면 밑줄. */
export function ChainLink({ className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button type="button" className={cn('focus-ring rounded text-left hover:text-primary hover:underline underline-offset-2', className)} {...rest}>
      {children}
    </button>
  );
}
