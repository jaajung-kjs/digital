import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from './cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** 내부 패딩 적용 여부(기본 true). false 면 패딩 없이 컨테이너로만. */
  padding?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { padding = true, className, children, ...rest },
  ref,
) {
  const interactive = typeof rest.onClick === 'function';
  return (
    <div
      ref={ref}
      className={cn(
        'bg-surface border border-line rounded shadow-sm',
        padding && 'p-4',
        interactive && 'row-interactive cursor-pointer',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
});
