import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from './cn';

export type BadgeStatus = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status?: BadgeStatus;
}

const statusClasses: Record<BadgeStatus, string> = {
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
  info: 'bg-info-bg text-info',
  neutral: 'bg-surface-2 text-content-muted border border-line',
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { status = 'neutral', className, children, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        /* 배지는 낱말 하나다 — 좁은 칸에서 「신설」이 신/설 두 줄로 쪼개지면 배지가 아니라
           동그라미 두 개로 보인다. */
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
        statusClasses[status],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
});
