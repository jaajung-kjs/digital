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
 */
export function Tabs<T extends string>({ items, value, onChange, className }: TabsProps<T>) {
  return (
    <div className={cn('flex items-stretch', className)} role="tablist">
      {items.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={cn(
              // 테두리는 항상 존재한다 — 활성 시에만 색을 준다(선택해도 레이아웃이 안 밀린다).
              'border-b-2 px-3 py-2 text-sm transition-colors focus-visible:outline-none',
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
