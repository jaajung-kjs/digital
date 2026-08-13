import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from './cn';
import { controlSizeClasses, type ControlSize } from './controlSize';

// 네이티브 size(글자 수)는 쓰지 않는다 — 폭은 레이아웃이 정한다.
export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** 조밀한 패널은 'sm'. 여백을 className 으로 덮어쓰지 않는다 — controlSize.ts 참고. */
  size?: ControlSize;
  /**
   * 이 칸의 값이 저장을 막는가 — 테두리로 **어느 칸인지** 짚는다.
   *
   * 문구는 부르는 쪽이 말한다(`DetailRow` 의 `issue`, 저장 바의 오류 수). 표처럼 라벨 옆에
   * 문구를 놓을 자리가 없는 자리에서는 이 테두리가 유일한 길잡이다.
   */
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, disabled, size = 'md', invalid = false, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      className={cn(
        'w-full border rounded text-content',
        // 표 셀은 표의 배경 위에 그대로 앉는다 — §controlSize.
        size === 'cell' ? 'bg-transparent' : 'bg-surface',
        invalid ? 'border-danger' : 'border-line',
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
