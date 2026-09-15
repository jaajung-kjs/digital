import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * 화면 제목줄 — **모든 화면이 같은 자리에 같은 모양으로 머리를 단다.**
 *
 * 남색 사각 불릿 + 화면명 + 경로(흐리게) + 우측 버튼군. 업무 시스템에서 이 줄은
 * 「내가 어느 화면의 어느 대상을 보고 있나」와 「여기서 할 수 있는 일」을 한 줄로 말한다.
 *
 * 예전에는 화면마다 제목을 제 방식으로 그렸다 — 어떤 화면은 제목이 크고 어떤 화면은
 * 없었으며, 버튼이 왼쪽에 있기도 오른쪽에 있기도 했다. **버튼은 늘 오른쪽 끝**이고
 * 주 버튼이 가장 오른쪽이다(`Button variant="primary"` 하나만).
 */
export function PageHeader({
  title, path, actions, className,
}: {
  title: string;
  /** 지금 보고 있는 대상 — 「강원본부 › 직할 › (구)춘천S/S」. */
  path?: ReactNode;
  /** 우측 버튼군 — 주 버튼은 맨 오른쪽 하나. */
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex h-[38px] shrink-0 items-center gap-3 border-b border-line-strong bg-surface px-4', className)}>
      <h1 className="flex shrink-0 items-center gap-2 text-sm font-bold text-content">
        <span aria-hidden className="h-3.5 w-[3px] bg-appbar" />
        {title}
      </h1>
      {path && <div className="min-w-0 flex-1 truncate text-xs text-content-faint">{path}</div>}
      {actions && <div className={cn('flex shrink-0 items-center gap-1.5', !path && 'ml-auto')}>{actions}</div>}
    </div>
  );
}
