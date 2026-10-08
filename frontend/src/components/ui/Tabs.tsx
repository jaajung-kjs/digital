import { useId, useRef } from 'react';
import { OverflowMenu, type OverflowMenuItem } from './OverflowMenu';
import { useInlineRename } from './useInlineRename';
import { cn } from './cn';

export interface TabItem<T extends string> {
  key: T;
  label: string;
  /**
   * 라벨 옆 개수. 탭을 열어보기 전에 "거기 무엇이 몇 개 있는지" 알려준다 —
   * 없으면 빈 탭인지 안 열어본 탭인지 구분이 안 된다.
   */
  count?: number;
  /**
   * 이 탭의 이름을 **그 자리에서** 고친다 — 탭을 두 번 누르거나 열린 탭의 `⋯` 에서.
   *
   * 시트 탭 어법이다(Excel·AutoCAD 배치·Figma 페이지). 이름이 곧 탭이므로 고치는 자리도
   * 탭이어야 한다 — 별도 상자를 띄우면 「무엇의 이름을 고치는 중인지」가 화면에서 사라진다.
   */
  onRename?: (name: string) => void;
  /** 열린 탭의 `⋯` 에 서는 것들 — 되돌릴 수 없는 것은 여기로(§1.7-h). */
  menu?: OverflowMenuItem[];
}

interface TabsProps<T extends string> {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (key: T) => void;
  /** 탭과 그 내용을 잇는 이름표 — `useTabs()` 가 만들어 준다. */
  idBase: string;
  /**
   * 탭의 **두 종류**(§3.7) — 부르는 쪽이 폭을 손으로 정하지 않는다.
   *
   * - `nav`(기본) — **내비게이션 탭**: 화면 머리의 뷰 탭·기준정보 페이지 탭·평면도 층 탭. 제 폭, 왼쪽 정렬이다 —
   *   항목이 늘거나 다른 단추와 한 줄에 서기 때문이다.
   * - `panel` — **패널 탭**: 상세 레일·창·카드 안의 탭. 줄을 **똑같이 나눠 채운다** — 좁은 패널에서 오른쪽이 빈 채로
   *   남지 않게. 자리는 `ViewCard tabs`(제목 띠 바로 아래 고정 띠)라 본문과 함께 흐르지 않는다.
   */
  variant?: 'nav' | 'panel';
  /**
   * 어느 **가장자리**에 서는가 — 기본은 위(`top`)다.
   *
   * 화면 아래에 서는 시트 탭(층 탭)은 고른 탭이 **위쪽 내용**과 이어져야 한다. Excel 시트·
   * AutoCAD 배치·Figma 페이지가 같은 어법이다. 위에 서는 탭과 방향만 뒤집으면 되므로
   * 컴포넌트를 따로 만들지 않는다.
   */
  edge?: 'top' | 'bottom';
  /** 열린 탭의 메뉴 단추 글자 — 없으면 `⋯` 아이콘만 선다. 아이콘만으로는 무엇의 메뉴인지 모른다(예: `층 관리`). */
  menuText?: string;
  className?: string;
}

/**
 * 탭 줄과 **그 내용**을 잇는다 — 둘이 같은 이름표를 나눠 갖는다.
 *
 * 화면으로 보는 사람에게는 탭 바로 아래가 그 내용이라는 것이 자명하지만, 화면을 못 보는
 * 사람에게는 그 자명함이 없다. `role="tab"` 만 붙여 두면 스크린리더는 「탭」이라고 읽고
 * **그 탭이 무엇을 여는지는 말해 주지 못한다** — 열어 놓고 내용을 찾아 헤매게 된다.
 * 이어 두면 탭에서 바로 내용으로 건너뛸 수 있다(WAI-ARIA APG Tabs).
 *
 *     const t = useTabs(tab);
 *     <Tabs {...t.list} items={TABS} onChange={setTab} />
 *     <div {...t.panel}>…</div>
 *
 * 내용 상자에 `tabIndex` 는 주지 않는다 — 그 안에 누를 것이 있으면 정거장이 하나 늘 뿐이다
 * (APG 도 「안에 초점 갈 것이 없을 때만」이라고 적는다).
 */
export function useTabs<T extends string>(value: T) {
  const base = useId();
  return {
    /** 탭 줄에 편다. */
    list: { idBase: base, value },
    /** 지금 열린 탭의 내용을 담는 자리에 편다. */
    panel: {
      role: 'tabpanel',
      id: `${base}-panel-${value}`,
      'aria-labelledby': `${base}-tab-${value}`,
    },
  } as const;
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
export function Tabs<T extends string>({ items, value, onChange, idBase, variant = 'nav', edge = 'top', menuText, className }: TabsProps<T>) {
  const fill = variant === 'panel';
  const list = useRef<HTMLDivElement>(null);
  /* 이름을 고치는 규칙(빈 이름·그대로면 아무 일 없음, Enter/포커스 잃음=확정, Esc=물림)은
     앱 공통이다 — 여기서 다시 적지 않는다. */
  const rename = useInlineRename((key, name) => items.find((t) => t.key === key)?.onRename?.(name));

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

  const activeItem = items.find((t) => t.key === value);
  const menu: OverflowMenuItem[] = [
    ...(activeItem?.onRename ? [{ label: '이름 변경', onSelect: () => rename.start(activeItem.key, activeItem.label) }] : []),
    ...(activeItem?.menu ?? []),
  ];

  return (
    /* `⋯` 는 **tablist 밖**에 선다 — 탭 목록에는 탭만 담긴다(APG). 겉 줄이 테두리를 갖는다. */
    <div
      className={cn(
        'flex items-stretch',
        edge === 'bottom' ? 'border-t border-line-strong' : 'border-b border-line-strong',
        fill && 'w-full',
        className,
      )}
    >
      <div
        ref={list}
        role="tablist"
        className={cn(fill ? 'grid min-w-0 flex-1' : 'flex items-stretch')}
        /* 패널 탭은 **같은 폭**으로 나눈다 — 다만 글자보다 좁아지지는 않는다(넘치는 탭만 제 폭, 나머지가 고르게 나눈다). */
        style={fill ? { gridTemplateColumns: `repeat(${items.length}, minmax(max-content, 1fr))` } : undefined}
      >
        {items.map((t, i) => {
          const active = t.key === value;
          if (rename.isEditing(t.key)) {
            /* 고치는 동안에는 그 자리에 칸이 선다 — 탭이 그대로 상자가 되는 것처럼 보인다. */
            return (
              <span key={t.key} className="flex items-center border-x border-line-strong bg-surface px-1 py-1">
                {rename.field(t.key, t.label, `${t.label} 이름`)}
              </span>
            );
          }
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`${idBase}-tab-${t.key}`}
              aria-controls={`${idBase}-panel-${t.key}`}
              aria-selected={active}
              /* 정거장은 하나 — 고른 탭만 Tab 을 받는다(roving tabindex). */
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(t.key)}
              /* 두 번 누르면 이름 칸이 선다 — 고칠 수 있는 탭만. */
              onDoubleClick={() => t.onRename && rename.start(t.key, t.label)}
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
                /* **사각 탭.** 고른 것만 흰 바탕으로 솟고 위에 파란 선이 그어진다 —
                   공공 업무화면의 관용구다. 밑줄만으로는 회색 띠 위에서 잘 안 읽힌다.
                   테두리·높이는 활성 여부와 무관하게 같아서 골라도 줄이 밀리지 않는다. */
                /* 탭 이름은 쪼개지지 않는다 — 좁은 띠에서 「3층」이 3/층 으로 섰다. */
                'relative shrink-0 whitespace-nowrap border py-1.5 text-sm transition-colors focus-ring',
                fill ? 'px-2 text-center' : 'px-3',
                edge === 'bottom' ? '-mt-px border-t-0' : '-mb-px border-b-0',
                // 줄을 가득 채울 때는 탭이 폭을 똑같이 나눠 갖는다.
                active
                  ? 'border-line-strong bg-surface font-bold text-appbar'
                  : 'border-transparent bg-surface-2/60 text-content-muted hover:text-content',
              )}
            >
              {/* 솟은 탭의 머리선 — 활성 표시는 색 하나가 아니라 **바탕 + 머리선**이다.
                  아래에 선 탭은 그 선도 아래에 긋는다(위쪽 내용과 이어져 보이게). */}
              {active && (
                <span
                  aria-hidden
                  className={cn('absolute inset-x-0 h-[2px] bg-primary', edge === 'bottom' ? 'bottom-0' : 'top-0')}
                />
              )}
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
      {menu.length > 0 && activeItem && (
        <OverflowMenu label={`${activeItem.label} 더 보기`} text={menuText} items={menu} />
      )}
    </div>
  );
}
