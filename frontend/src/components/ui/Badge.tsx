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
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        statusClasses[status],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
});
