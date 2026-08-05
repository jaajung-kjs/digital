import type { ReactNode } from 'react';
import { cn } from './cn';

interface EmptyStateProps {
  /** 한 줄 요약 — 무엇이 없는지. */
  title: ReactNode;
  /** 왜 비었는지 / 어떻게 채우는지. 없으면 제목만 나온다. */
  description?: ReactNode;
  /** 시작 동작(자산 추가 등). */
  action?: ReactNode;
  className?: string;
}

/**
 * 화면이 비었을 때의 표준 안내 — 본문 영역 한가운데.
 *
 * 예전에는 화면마다 달랐다: 워크스페이스는 좌상단에 한 줄(`p-4`), 카탈로그는 가운데 한 줄,
 * 선번장/계통은 가운데 제목+설명. 같은 상황인데 눈이 매번 다른 자리를 찾아야 했다.
 * `w-full` 을 명시하는 이유: 부모의 정렬 방식에 따라 가운데가 아닌 곳에 놓이던 것을 막는다.
 */
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex w-full flex-1 items-center justify-center px-6 py-10', className)}>
      <div className="max-w-md text-center">
        <p className="text-sm text-content-muted">{title}</p>
        {description && <p className="mt-1 text-xs text-content-faint">{description}</p>}
        {action && <div className="mt-3 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}
