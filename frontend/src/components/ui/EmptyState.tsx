import type { ReactNode } from 'react';
import { cn } from './cn';

interface EmptyStateProps {
  /** **무엇이 없는가** — 사실 한 줄. */
  title: ReactNode;
  /**
   * **무엇을 하면 나타나는가** — 행동 한 줄. 없으면 제목만 나온다.
   *
   * 배경 설명(왜 이런 규칙인지, 무엇이 어떻게 동작하는지)은 적지 않는다. 빈 화면을 만난
   * 사람이 알고 싶은 것은 다음에 무엇을 누를지이고, 설명은 그 자리에서 읽히지 않는다.
   * 그리고 **거른 결과가 없을 때는 제목만 쓴다** — 「검색 결과가 없습니다」 + 「'x' 와 맞는
   * 것이 없습니다」처럼 같은 말을 두 번 하게 된다.
   */
  description?: ReactNode;
  /** 시작 동작(자산 추가 등). */
  action?: ReactNode;
  className?: string;
}

/**
 * 화면이 비었을 때의 표준 안내 — 본문 영역 한가운데.
 *
 * 예전에는 화면마다 달랐다: 설비 관리는 좌상단에 한 줄(`p-4`), 카탈로그는 가운데 한 줄,
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
