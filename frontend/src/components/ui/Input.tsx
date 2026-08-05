import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from './cn';
import { controlSizeClasses, type ControlSize } from './controlSize';

// 네이티브 size(글자 수)는 쓰지 않는다 — 폭은 레이아웃이 정한다.
export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** 조밀한 패널은 'sm'. 여백을 className 으로 덮어쓰지 않는다 — controlSize.ts 참고. */
  size?: ControlSize;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, disabled, size = 'md', ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      disabled={disabled}
      className={cn(
        'w-full bg-surface border border-line rounded text-content',
        controlSizeClasses[size],
        'placeholder:text-content-faint',
        'transition-colors focus:outline-none focus:border-primary focus-ring-input',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
      {...rest}
    />
  );
});
