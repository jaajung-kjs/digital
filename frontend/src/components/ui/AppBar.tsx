import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * 상단 띠 — **한전 CI 색이 서는 유일한 자리**.
 *
 * 공공·공기업 업무 시스템은 화면 맨 위에 기관 색 띠가 있고 그 아래로 회색 메뉴바가
 * 붙는다. 그 두 줄이 「사내 시스템」이라는 인상의 대부분을 만든다 — 없으면 화면이
 * 아무 회사의 웹앱처럼 보인다.
 *
 * **여기 말고 어디에도 `bg-appbar` 를 쓰지 않는다.** CI 색을 본문에 풀면 그 순간 기관
 * 색이 아니라 그냥 파란 화면이 된다. 본문의 주 동작 색은 `primary`(KRDS)다.
 */
export function AppBar({
  title, subtitle, onTitleClick, children, className,
}: {
  title: string;
  /** 시스템의 정식 명칭 — 짧은 제목 옆에 흐리게 붙는다. */
  subtitle?: string;
  onTitleClick?: () => void;
  /** 우측 — 사용자·로그아웃 등. */
  children?: ReactNode;
  className?: string;
}) {
  const Title = onTitleClick ? 'button' : 'div';
  return (
    <header className={cn('flex h-[46px] shrink-0 items-center gap-3 bg-appbar px-4 text-appbar-fg', className)}>
      <Title
        type={onTitleClick ? 'button' : undefined}
        onClick={onTitleClick}
        className="flex shrink-0 items-center gap-2 text-left"
      >
        {/* 로고 자리 — 사내 CI 심벌이 들어올 자리다. 그전에는 사각 하나로 자리를 잡아 둔다. */}
        <span aria-hidden className="size-3.5 bg-appbar-fg" />
        <span className="text-base font-bold tracking-tight">{title}</span>
      </Title>
      {subtitle && <span className="hidden shrink-0 text-xs text-appbar-fg/75 sm:inline">{subtitle}</span>}
      <div className="ml-auto flex shrink-0 items-center gap-3">{children}</div>
    </header>
  );
}
