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
        'press-btn focus-ring p-2 rounded text-content-muted hover:bg-surface-2',
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
