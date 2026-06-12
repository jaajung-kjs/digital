import { forwardRef, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from './cn';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, disabled, children, ...rest },
  ref,
) {
  return (
    <div className="relative w-full">
      <select
        ref={ref}
        disabled={disabled}
        className={cn(
          'w-full appearance-none bg-surface border border-line rounded pl-3 pr-9 py-2 text-sm text-content',
          'transition-colors focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20',
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
