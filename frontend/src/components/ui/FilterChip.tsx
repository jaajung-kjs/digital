import { cn } from './cn';

export interface FilterChipProps {
  label: string;
  /** **거르기 전 전체**다 — 걸러 놓고 그 숫자를 다시 세면 칩이 늘 0 이 된다. */
  count: number;
  on: boolean;
  /** 0 이 아닐 때 글자가 위험·주의 색을 쓴다 — 켜져 있을 때는 선택 색이 이긴다. */
  tone?: 'default' | 'danger' | 'warning';
  onClick: () => void;
}

/**
 * 토글형 **거르개** — 「몇 개 있고, 손볼 것이 있는가」를 세면서 동시에 거른다.
 *
 * 판의 머리 띠 왼쪽 첫 칸에 선다(§3.1). 예전에는 현황 화면 안에서 일회용
 * `<button className="rounded-full …">` 으로 만들어져 있었다 — 「패널 안에서 일회용
 * 카드·필드를 새로 만들지 않는다」(§0.1)를 어긴 자리였다.
 *
 * 접근 가능한 이름은 **「이름 숫자」** 다(`미점검 39`) — 화면과 시험이 같은 것을 읽는다.
 */
export function FilterChip({ label, count, on, tone = 'default', onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        /* 머리 띠의 다른 컨트롤과 같은 24px — 줄 높이를 넘기면 띠가 그만큼 두꺼워진다. */
        'inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors',
        on ? 'border-primary bg-info-bg text-primary' : 'border-line text-content-muted hover:bg-surface-2',
        !on && tone === 'danger' && count > 0 && 'text-danger',
        !on && tone === 'warning' && count > 0 && 'text-warning',
      )}
    >
      {label} <span className="font-medium tabular-nums">{count}</span>
    </button>
  );
}
