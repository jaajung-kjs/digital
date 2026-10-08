import { cn } from './cn';

/**
 * 두 상태를 오가는 스위치 — 차단기의 개폐처럼 **켜짐/꺼짐이 곧 값**인 자리.
 *
 * 체크박스가 아니라 스위치인 이유: 체크박스는 "고를 것인가" 를 묻고, 스위치는 "지금 어느
 * 쪽인가" 를 보여 준다. 차단기 개폐는 뒤쪽이다 — 판을 훑는 사람이 무엇이 살아 있고 무엇이
 * 끊겨 있는지 한눈에 읽어야 한다.
 *
 * `sm` 은 표 칸처럼 자리가 작은 곳용이다. 글자는 스위치 옆에만 두고(§1 타이포 스케일),
 * 스위치 자체에는 넣지 않는다 — 트랙 안에 글자를 넣으면 `text-xs` 밑으로 내려가야 한다.
 */
export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  /** 스크린리더가 읽을 이름 — 옆에 글자를 안 둘 때 반드시 준다. */
  'aria-label'?: string;
  /** 스위치 옆에 붙는 글자. 주면 라벨 전체가 눌리는 영역이 된다. */
  label?: string;
  className?: string;
}

const TRACK = {
  sm: 'h-3.5 w-6',
  md: 'h-5 w-9',
} as const;

const KNOB = {
  sm: { size: 'h-2.5 w-2.5', off: 'translate-x-0.5', on: 'translate-x-3' },
  md: { size: 'h-4 w-4', off: 'translate-x-0.5', on: 'translate-x-4' },
} as const;

export function Toggle({
  checked, onChange, disabled = false, size = 'md', label, className, ...rest
}: ToggleProps) {
  const track = (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full transition-colors',
        TRACK[size],
        checked ? 'bg-primary' : 'bg-surface-3',
        disabled && 'opacity-50',
      )}
    >
      <span
        className={cn(
          'pointer-events-none absolute rounded-full bg-white shadow-sm transition-transform',
          KNOB[size].size,
          checked ? KNOB[size].on : KNOB[size].off,
        )}
      />
    </span>
  );

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={rest['aria-label']}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'inline-flex items-center gap-1.5',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        className,
      )}
    >
      {track}
      {label && <span className="text-xs text-content-muted">{label}</span>}
    </button>
  );
}
