import { cn } from './cn';

/**
 * 거르개 칩의 **생김새 한 벌** — 토글(`FilterChip`)과 갈래(`SegmentedControl`)가 나눠 쓴다.
 *
 * 둘은 하는 일이 다르지만(여럿 켜기 vs 하나 고르기) 판의 머리 띠 **같은 자리**에 서는
 * 거르개다. 생김새가 갈리면 그 자리가 화면마다 다른 것으로 읽힌다 — 실제로 하나는 알약
 * (`rounded-full`), 하나는 이어 붙인 네모라 나란히 놓으면 딴 물건으로 보였다.
 * 무엇을 고르는 방식인지는 **모양이 아니라 ARIA**(`aria-pressed` / `role="radio"`)가 말한다.
 *
 * 모서리는 `rounded`(2px) 하나다(§3.2) — 알약은 업무화면의 밀도에서 「꼬리표」로 읽힌다.
 */
export function chipClass(on: boolean, extra?: string) {
  return cn(
    /* 머리 띠의 다른 컨트롤과 같은 24px — 줄 높이를 넘기면 띠가 그만큼 두꺼워진다. */
    'inline-flex h-6 shrink-0 items-center gap-1 rounded border px-2.5 text-xs transition-colors focus-ring',
    on ? 'border-primary bg-info-bg font-medium text-primary' : 'border-line text-content-muted hover:bg-surface-2',
    extra,
  );
}

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
      className={chipClass(
        on,
        cn(
          !on && tone === 'danger' && count > 0 && 'text-danger',
          !on && tone === 'warning' && count > 0 && 'text-warning',
        ),
      )}
    >
      {label} <span className="font-medium tabular-nums">{count}</span>
    </button>
  );
}
