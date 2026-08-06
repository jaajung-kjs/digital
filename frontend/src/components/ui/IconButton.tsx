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
  /**
   * 되돌리기 어려운 동작(삭제 등)은 `danger`.
   *
   * 붉은 **덩어리** 버튼(`Button variant="danger"`)은 도구바에 상시 떠 있으면 시선을 붙들고
   * 잘못 누르기도 쉽다. 아이콘은 평소 다른 버튼과 같은 무게로 있다가 손이 닿을 때만
   * 붉어져 "이건 지우는 것" 을 알린다.
   */
  tone?: 'default' | 'danger';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { children, className, active, type, disabled, size = 'md', tone = 'default', ...rest },
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
        tone === 'danger' && 'hover:bg-danger-bg hover:text-danger',
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
