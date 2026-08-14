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
  /**
   * **왜 못 누르는지** — `disabled` 일 때 얹으면 뜬다.
   *
   * 회색 버튼은 그 자체로는 아무 말도 하지 않아서 「왜 안 눌리지」 막다른 길이 된다.
   * 이유를 말할 수 없다면 그 버튼은 아예 두지 않는 편이 낫다(Fiori·Fluent·Atlassian).
   */
  disabledReason?: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { children, className, active, type, disabled, size = 'md', tone = 'default', disabledReason, ...rest },
  ref,
) {
  const label = rest['aria-label'];
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      disabled={disabled}
      /* 이유는 `title` 로 — 비활성 버튼은 초점을 받지 못해 `aria-describedby` 가 낭독되지
         않는다. 그래서 `aria-label` 에도 이유를 붙여 보조기술이 함께 읽게 한다. */
      title={disabled ? disabledReason : undefined}
      className={cn(
        'press-btn focus-ring rounded text-content-muted hover:bg-surface-2',
        size === 'sm' ? 'p-0.5' : 'p-2',
        tone === 'danger' && 'hover:bg-danger-bg hover:text-danger',
        active && 'bg-info-bg text-primary',
        disabled && 'opacity-40 cursor-not-allowed',
        className,
      )}
      {...rest}
      aria-label={disabled && disabledReason ? `${label} — ${disabledReason}` : label}
    >
      {children}
    </button>
  );
});
