import type { ReactNode } from 'react';
import { cn } from './cn';

interface PanelHeaderProps {
  /** 좌측 제목. 사이드바는 라벨 성격(작게), 본문 헤더는 대상 이름(굵게)이다. */
  title?: ReactNode;
  /** 제목 오른쪽에 이어 붙는 것 — 뷰 탭 등. */
  children?: ReactNode;
  /** 우측 끝으로 밀리는 액션 영역. */
  actions?: ReactNode;
  /** sidebar: 사이드바 상단(작은 라벨) / content: 본문 상단(대상 이름) */
  variant?: 'sidebar' | 'content';
  className?: string;
}

/**
 * 패널 상단 바 — 사이드바와 본문이 같은 높이·여백·구분선을 쓰도록 하는 단일 지점.
 *
 * 이전에는 조직 트리·타입 목록·워크스페이스 본문·카탈로그 본문이 각자 헤더를 만들어
 * 높이(py-2 / py-1.5 / 없음)와 배경·테두리 소유가 제각각이었다. 사이드바 하나는
 * 헤더가 아예 없어 목록이 상단에서 잘린 것처럼 보였다.
 *
 * 높이를 고정하는 이유: 좌우 패널의 첫 구분선이 어긋나면 화면 전체가 흐트러져 보인다.
 */
export function PanelHeader({ title, children, actions, variant = 'content', className }: PanelHeaderProps) {
  return (
    <div
      className={cn(
        'flex h-10 shrink-0 items-center gap-2 border-b border-line px-3',
        variant === 'content' && 'px-4',
        className,
      )}
    >
      {title != null && (
        <span
          className={cn(
            variant === 'sidebar' ? 'text-xs font-medium text-content-muted' : 'text-sm font-semibold text-content',
          )}
        >
          {title}
        </span>
      )}
      {children}
      {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
    </div>
  );
}
