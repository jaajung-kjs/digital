import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * 화면이 아직 못 그리는 이유 — **읽는 중**과 **못 읽었다**.
 *
 * 네 화면이 각자 답하고 있었고 그래서 넷이 달랐다: 「로딩 중…」 · 「불러오는 중…」 ·
 * `return null`(빈 화면) · 오류 처리 없음. 같은 사정에 화면마다 다른 말이 나오면, 읽는
 * 사람은 그것이 다른 사정인 줄 안다.
 *
 * 말은 하나다: 읽는 중이면 **불러오는 중…**, 못 읽었으면 **무엇을 못 읽었는지**.
 * 그리고 `null` 을 돌려주지 않는다 — 아무것도 없는 화면은 고장과 구별되지 않는다.
 *
 * 못 읽었으면 **다시 해 볼 길**을 함께 둔다(`action` — 대개 「다시 시도」 단추). 길이 없으면
 * 사람은 새로고침하거나 다른 데를 눌렀다 돌아오는 수밖에 없다.
 */
export function PageState({ error, action, className }: { error?: string | null; action?: ReactNode; className?: string }) {
  return (
    <div
      className={cn('flex h-full flex-col items-center justify-center gap-2 text-sm', error ? 'text-danger' : 'text-content-muted', className)}
      role={error ? 'alert' : 'status'}
    >
      <span>{error ?? '불러오는 중…'}</span>
      {error && action}
    </div>
  );
}
