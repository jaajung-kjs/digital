import { cn } from './cn';
import type { BadgeStatus } from './Badge';

const DOT: Record<BadgeStatus, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  neutral: 'bg-content-faint',
};

/** 눈길을 끌어야 하는 상태 — 이 톤일 때만 글자까지 색을 준다. */
const ALERTING: ReadonlySet<BadgeStatus> = new Set<BadgeStatus>(['warning', 'danger']);

const TEXT: Record<BadgeStatus, string> = {
  success: 'text-content',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-content',
  neutral: 'text-content-muted',
};

/**
 * 표 안에서 되풀이되는 상태 — 점 + 글자.
 *
 * 상태를 `Badge`(색 채운 알약)로 그리면 한 개일 때는 좋지만 **표의 한 열로 내려가면**
 * 17행이 전부 초록 알약이 된다. 그러면 색이 아무것도 말해 주지 않는다 —
 * 모든 것이 강조되면 어느 것도 강조되지 않는다. 정작 고장 한 줄이 생겨도 묻힌다.
 *
 * 그래서 평상시(정상·예비)는 조용히 두고, 눈길을 끌어야 하는 톤(경고·고장)만 글자까지
 * 색을 준다. 무엇이 "눈길을 끌 상태" 인가는 상태 어휘가 선언한 톤에서 나온다 —
 * 여기서 상태 값 이름(`normal`·`fault` 같은 것)을 아는 곳은 없다.
 *
 * 단독으로 강조하는 자리(패널 머리말, 안내 띠)는 그대로 `Badge` 를 쓴다.
 */
export function StatusDot({ status, children }: { status: BadgeStatus; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm', TEXT[status])}>
      <span className={cn('size-1.5 shrink-0 rounded-full', DOT[status])} aria-hidden />
      <span className={cn(ALERTING.has(status) && 'font-medium')}>{children}</span>
    </span>
  );
}
