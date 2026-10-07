import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'xs' | 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /**
   * 기본은 **`sm`(24px)**. 표 줄 안에서는 **`xs`**(h-5 고정) — 그보다 크면 `Td` 여백과 합쳐 그 줄만 높아진다.
   *
   * 업무화면의 버튼은 작다 — 표 행이 28px 인 화면에서 32px 버튼은 줄 사이를 벌린다. 예전
   * 기본값이 `md` 라 크기를 안 적은 여섯 곳만 다른 크기로 서 있었다(적은 곳은 전부 `sm`).
   * 기본값이 실제로 쓰는 값이어야 적지 않은 것이 틀리지 않는다.
   */
  size?: ButtonSize;
  /**
   * `danger` — 지우는 글자 단추(`secondary`·`ghost` 에만). 붉은 덩어리(`variant="danger"`)는 확인 상자의
   * 최종 확인 같은 **주 동작**에만 쓰고, 늘 떠 있는 지우기는 글자만 붉게 둔다(CONVENTIONS §3 버튼).
   */
  tone?: 'default' | 'danger';
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover',
  secondary: 'bg-surface border border-line text-content hover:bg-surface-2',
  ghost: 'text-content hover:bg-surface-2',
  danger: 'bg-danger text-white hover:opacity-90',
};

/** 글자만 붉은 지우기 단추 — `cn` 은 tailwind-merge 가 아니라 글자색을 덧대면 충돌하므로 통째로 바꾼다. */
const dangerToneClasses: Partial<Record<ButtonVariant, string>> = {
  secondary: 'bg-surface border border-line text-danger hover:bg-danger-bg',
  ghost: 'text-danger hover:bg-danger-bg',
};

const sizeClasses: Record<ButtonSize, string> = {
  /* 표 줄(`TABLE_ROW` h-7, 28px) 안의 단추 — `Td` 가 위아래 4px 씩 쓰므로 남는 자리는 20px 이다.
     높이를 그만큼 못 박아 줄을 벌리지 않는다(h-6 이면 그 줄만 33px). 기준선에 앉히면 글자 아래 여백만큼
     또 1~2px 벌어지므로 `align-top`. */
  xs: 'h-5 text-xs px-2 py-0 align-top',
  sm: 'text-xs px-2.5 py-1',
  md: 'text-sm px-3.5 py-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'sm', tone = 'default', leftIcon, rightIcon, className, children, type, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      disabled={disabled}
      className={cn(
        /* 글자는 쪼개지지 않는다 — 좁아진 띠에서 「모두 접기」가 모/두/접/기 세로로 섰다. */
        'press-btn focus-ring inline-flex items-center gap-1.5 whitespace-nowrap rounded font-medium',
        (tone === 'danger' && dangerToneClasses[variant]) || variantClasses[variant],
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
