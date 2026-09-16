import { cn } from './cn';

export interface SegmentedItem<T extends string> {
  key: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  items: readonly SegmentedItem<T>[];
  value: T;
  onChange: (key: T) => void;
  'aria-label': string;
}

/**
 * 상호배타 **갈래** — 「같은 자료를 어느 갈래로 볼까」.
 *
 * **탭이 아니다.** 탭은 다른 내용으로 건너가는 것이고, 갈래는 같은 내용을 거르는 것이다.
 * 생김새를 탭과 같이 두면 위계가 읽히지 않는다 — 계통의 `전체·교류·직류` 가 뷰 탭
 * (현황·평면도·선번장·계통)과 똑같은 사각 탭이었고, 도구바 안에 서느라 **상위 탭보다
 * 14px 더 높기**까지 했다.
 *
 * 현업 자료가 이미 갈래로 나뉘어 있다: 강원본부 통신실 전원계통도는 같은 배치도 위에
 * 「전체·AC·DC」 세 장을 따로 그려 두었다.
 */
export function SegmentedControl<T extends string>({
  items, value, onChange, ...rest
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={rest['aria-label']}
      className="flex shrink-0 items-center rounded border border-line"
    >
      {items.map((it) => {
        const on = it.key === value;
        return (
          <button
            key={it.key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(it.key)}
            className={cn(
              /* 머리 띠의 다른 컨트롤과 같은 24px(`controlSize.ts` 의 `sm`) — 줄 높이를
                 넘기면 띠가 그만큼 두꺼워진다. */
              'h-6 border-r border-line px-2.5 text-xs transition-colors last:border-r-0 focus-ring',
              on ? 'bg-info-bg font-medium text-primary' : 'text-content-muted hover:bg-surface-3',
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
