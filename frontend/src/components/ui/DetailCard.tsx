import type { ReactNode } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
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

/**
 * 카드 헤더 — 제목(좌) + 상태 배지 + 우측 수정/삭제 액션(점검·고장이력 카드와 동일 패턴).
 * onEdit/onDelete 를 주면 우측에 연필/휴지통 아이콘 버튼이 뜬다(상세 카드 일관성).
 */
export function DetailCardHeader({
  title,
  badge,
  badgeStatus = 'neutral',
  onEdit,
  onDelete,
}: {
  title: ReactNode;
  badge?: ReactNode;
  badgeStatus?: BadgeStatus;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-medium text-content">{title}</span>
      {badge != null && <Badge status={badgeStatus}>{badge}</Badge>}
      {(onEdit || onDelete) && (
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {onEdit && (
            <button type="button" onClick={onEdit} title="수정" aria-label="수정"
              className="rounded p-0.5 text-content-faint transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
              <Pencil size={14} />
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={onDelete} title="삭제" aria-label="삭제"
              className="rounded p-0.5 text-content-faint transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}
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
