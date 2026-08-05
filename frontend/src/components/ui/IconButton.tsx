import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  /** lucide 아이콘 등 */
  children: ReactNode;
  /** 접근성 라벨(필수) */
  'aria-label': string;
  /** 활성/선택 상태 강조 */
  active?: boolean;
  /**
   * 'sm' 은 목록 행 안에 들어가는 크기. 행 높이를 넘기지 않는 것이 중요하다 —
   * 큰 아이콘 버튼이 행에 끼어들면 호버할 때 행이 커지면서 목록 전체가 흔들린다.
   */
  size?: 'sm' | 'md';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { children, className, active, type, disabled, size = 'md', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      disabled={disabled}
      className={cn(
        'press-btn focus-ring rounded text-content-muted hover:bg-surface-2',
        size === 'sm' ? 'p-0.5' : 'p-2',
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
