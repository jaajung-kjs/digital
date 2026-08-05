import { forwardRef, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from './cn';
import { controlSizeClasses, type ControlSize } from './controlSize';

// 네이티브 size(보이는 항목 수)는 쓰지 않는다 — 이 Select 는 항상 드롭다운이다.
export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /** 조밀한 패널은 'sm'. 여백을 className 으로 덮어쓰지 않는다 — controlSize.ts 참고. */
  size?: ControlSize;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, disabled, size = 'md', children, ...rest },
  ref,
) {
  return (
    <div className="relative w-full">
      <select
        ref={ref}
        disabled={disabled}
        className={cn(
          'w-full appearance-none bg-surface border border-line rounded text-content',
          // 우측은 화살표 자리를 비워 둔다 — 값이 아이콘 아래로 들어가지 않게.
          controlSizeClasses[size],
          'pr-9',
          'transition-colors focus:outline-none focus:border-primary focus-ring-input',
          disabled && 'opacity-50 cursor-not-allowed',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-content-faint"
        size={16}
        aria-hidden
      />
    </div>
  );
});
