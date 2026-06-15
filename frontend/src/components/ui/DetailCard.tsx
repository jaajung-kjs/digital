import type { ReactNode } from 'react';
import { cn } from './cn';
import { Badge, type BadgeStatus } from './Badge';

/**
 * 사이드패널 "선택 상세 카드" 표준 — 점검·고장이력(SectionItem)과 동일한 외형
 * (rounded-lg / border-line / bg-surface / p-3)으로 통일한다. 광슬롯 포트·피더 CB
 * 등 "무언가를 클릭하면 아래에 뜨는 상세 카드"는 모두 이 컴포넌트를 쓴다.
 *
 * 타이포 스케일(고정): 본문=text-sm, 라벨/메타/배지=text-xs. text-xs 미만 금지.
 * → src/components/ui/CONVENTIONS.md 참고.
 */
export function DetailCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-lg border border-line bg-surface p-3 text-sm space-y-2', className)}>
      {children}
    </div>
  );
}

/** 카드 헤더 — 제목(좌) + 선택적 상태 배지(우측 정렬은 호출측 자유). */
export function DetailCardHeader({
  title,
  badge,
  badgeStatus = 'neutral',
}: {
  title: ReactNode;
  badge?: ReactNode;
  badgeStatus?: BadgeStatus;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-medium text-content">{title}</span>
      {badge != null && <Badge status={badgeStatus}>{badge}</Badge>}
    </div>
  );
}

/**
 * 라벨-값 한 줄 — 라벨(좌, 고정폭 text-xs) + 값(우, text-sm). 값에는 텍스트뿐 아니라
 * EditableField 같은 인라인 편집 노드도 넣을 수 있다(정보 탭 FormRow 와 동형).
 */
export function DetailRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-xs text-content-muted">{label}</span>
      <span className="flex-1 min-w-0 text-content">{children}</span>
    </div>
  );
}

/** 카드 하단 보조 설명(어디서 더 보라 등). */
export function DetailNote({ children }: { children: ReactNode }) {
  return <p className="text-xs text-content-faint">{children}</p>;
}
