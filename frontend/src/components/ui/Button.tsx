import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover',
  secondary: 'bg-surface border border-line text-content hover:bg-surface-2',
  ghost: 'text-content hover:bg-surface-2',
  danger: 'bg-danger text-white hover:opacity-90',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'text-xs px-2.5 py-1',
  md: 'text-sm px-3.5 py-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', leftIcon, rightIcon, className, children, type, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      disabled={disabled}
      className={cn(
        'press-btn focus-ring inline-flex items-center gap-1.5 rounded font-medium',
        variantClasses[variant],
        sizeClasses[size],
        /* 비활성은 **색을 죽인다** — 반투명으로만 두면 흰 글자 대비가 2.73:1 로 떨어지면서도
           여전히 파란 주 버튼처럼 보여, 눌리지 않는 이유가 화면에 없다. */
        disabled && 'cursor-not-allowed !bg-surface-3 !text-content-faint !border-line !shadow-none',
        className,
      )}
      {...rest}
    >
      {leftIcon}
      {children}
      {rightIcon}
    </button>
  );
});
