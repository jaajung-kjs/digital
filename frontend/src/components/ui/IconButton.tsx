import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** lucide 아이콘 등 */
  children: ReactNode;
  /** 접근성 라벨(필수) */
  'aria-label': string;
  /** 활성/선택 상태 강조 */
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { children, className, active, type, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      disabled={disabled}
      className={cn(
        'p-2 rounded text-content-muted transition-colors duration-150 hover:bg-surface-2',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1',
        active && 'bg-info-bg text-primary',
        disabled && 'opacity-40 cursor-not-allowed',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
