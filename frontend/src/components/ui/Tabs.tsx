import { useRef } from 'react';
import { cn } from './cn';

export interface TabItem<T extends string> {
  key: T;
  label: string;
  /**
   * 라벨 옆 개수. 탭을 열어보기 전에 "거기 무엇이 몇 개 있는지" 알려준다 —
   * 없으면 빈 탭인지 안 열어본 탭인지 구분이 안 된다.
   */
  count?: number;
}

interface TabsProps<T extends string> {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (key: T) => void;
  className?: string;
}

/**
 * 밑줄형 탭 — 뷰 전환·상세 패널·카탈로그가 같은 형태를 쓰도록 하는 단일 지점.
 *
 * 이전에는 같은 탭이 세 곳에 각자 구현돼 있었고 패딩이 전부 달랐다(py-1 / py-2 / py-2 + px-3 / px-4).
 * 그중 둘은 **비활성 탭에 border-b-2 가 없어** 탭을 고를 때마다 줄 전체가 2px 밀렸다.
 * 여기서는 항상 테두리 자리를 잡아 두고 색만 바꾼다.
 *
 * **탭 줄은 하나의 정거장이다**(§1.7-k, WAI-ARIA APG Tabs). Tab 은 줄 전체에 한 번만 서고,
 * 그 안은 ←/→ 로 옮긴다 — 탭이 여섯이면 Tab 여섯 번이 아니라 한 번이다. 옮기면 그 자리에서
 * 바로 열린다(automatic activation): 탭 내용이 이미 다 손에 있어 여는 값이 싸므로, 화살표로
 * 훑는 사람에게 Enter 를 한 번 더 누르게 할 이유가 없다.
 */
export function Tabs<T extends string>({ items, value, onChange, className }: TabsProps<T>) {
  const list = useRef<HTMLDivElement>(null);

  /** 화살표로 옮긴다 — 끝에서 반대쪽으로 감는다(APG: 목록이 순환한다). */
  function move(from: number, delta: number | 'first' | 'last') {
    const n = items.length;
    if (n === 0) return;
    const to =
      delta === 'first' ? 0 : delta === 'last' ? n - 1 : (from + delta + n) % n;
    const next = items[to];
    if (!next) return;
    onChange(next.key);
    /* 고른 것과 초점은 함께 움직인다 — 초점만 남으면 다음 Tab 이 엉뚱한 탭에서 출발한다. */
    list.current?.querySelectorAll<HTMLElement>('[role="tab"]')[to]?.focus();
  }

  return (
    <div ref={list} className={cn('flex items-stretch', className)} role="tablist">
      {items.map((t, i) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            /* 정거장은 하나 — 고른 탭만 Tab 을 받는다(roving tabindex). */
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => {
              const d =
                e.key === 'ArrowRight' ? 1
                : e.key === 'ArrowLeft' ? -1
                : e.key === 'Home' ? ('first' as const)
                : e.key === 'End' ? ('last' as const)
                : null;
              if (d === null) return;
              e.preventDefault();
              move(i, d);
            }}
            className={cn(
              // 테두리는 항상 존재한다 — 활성 시에만 색을 준다(선택해도 레이아웃이 안 밀린다).
              'border-b-2 px-3 py-2 text-sm transition-colors focus-ring',
              active
                ? 'border-primary font-medium text-primary'
                : 'border-transparent text-content-muted hover:text-content',
            )}
          >
            {t.label}
            {t.count != null && (
              <span
                className={cn(
                  'ml-1.5 rounded px-1 text-xs tabular-nums',
                  active ? 'bg-info-bg text-primary' : 'bg-surface-2 text-content-faint',
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
