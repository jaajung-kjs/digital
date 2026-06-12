import { useState, type ReactNode } from 'react';

/**
 * 상세패널 탭 바(#6) — 접이식 섹션을 대체하는 가로 탭들.
 * 정보·점검·고장이력·사진·연결을 한 줄의 탭 버튼으로 나열하고, 활성 탭 본문만
 * 아래 영역에 렌더. 384px 좁은 패널에 맞게 컴팩트(text-xs, px-3 py-2).
 *
 * - 활성: text-content font-medium + border-b-2 border-primary 밑줄
 * - 비활성: text-content-muted hover:text-content + border-b-2 border-transparent
 * - 전체 바 하단에 단일 border-b border-line. 탭 사이 라인 남발 없음.
 * - 연결 탭에만 muted 카운트(소음 아님).
 */
export interface DetailTab {
  /** 탭 라벨(=식별자). */
  label: string;
  /** 우측 muted 카운트(연결 등). 0/undefined 면 표시 안 함. */
  count?: number;
  /** 활성 시 렌더되는 본문. lazy — 활성 탭만 마운트. */
  render: () => ReactNode;
}

export function DetailTabs({ tabs, initial }: { tabs: DetailTab[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? tabs[0]?.label);
  const current = tabs.find((t) => t.label === active) ?? tabs[0];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* 탭 바 — 패널 헤더 아래 sticky, 단일 하단 라인. */}
      <div
        role="tablist"
        className="sticky top-0 z-10 flex shrink-0 items-stretch border-b border-line bg-surface"
      >
        {tabs.map((t) => {
          const on = t.label === current?.label;
          return (
            <button
              key={t.label}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setActive(t.label)}
              // flex-1 로 5개 탭이 패널 폭을 균등 분배 — 우측 여백 없음.
              className={`relative -mb-px flex flex-1 items-center justify-center gap-1 px-1 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors focus-ring active:bg-surface-3 ${
                on
                  ? 'text-content font-medium border-primary'
                  : 'text-content-muted hover:text-content hover:bg-surface-2 border-transparent'
              }`}
            >
              {t.label}
              {t.count ? (
                <span className="text-xs text-content-faint font-normal">{t.count}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* 본문 — 활성 탭 하나. 넉넉한 패딩, 중첩 구분선 없음. */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3">
        {current?.render()}
      </div>
    </div>
  );
}
