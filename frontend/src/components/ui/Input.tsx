import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from './cn';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, disabled, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      disabled={disabled}
      className={cn(
        'w-full bg-surface border border-line rounded px-3 py-2 text-sm text-content',
        'placeholder:text-content-faint',
        'transition-colors focus:outline-none focus:border-primary focus-ring-input',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
      {...rest}
    />
  );
});
