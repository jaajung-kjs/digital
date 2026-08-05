import type { ReactNode } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { cn } from './cn';
import { Badge, type BadgeStatus } from './Badge';
import { IconButton } from './IconButton';

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
 * 카드 헤더 — 제목(좌) + 상태 배지 + 우측 액션.
 *
 * 카드 안 섹션 제목은 전부 이것을 쓴다. 예전에는 절반이 `<p className="text-xs font-semibold
 * text-content-muted">속성</p>` 처럼 직접 쓰여 있어서, 같은 패널 안에서도 어떤 섹션 제목은
 * 12px 회색이고 어떤 것은 14px 검정이었다 — 제목 크기가 제각각으로 보이던 주된 이유다.
 *
 * 우측 액션: 수정/삭제는 `onEdit`/`onDelete`, 그 밖의 버튼(업로드·추가 등)은 `actions`.
 */
export function DetailCardHeader({
  title,
  badge,
  badgeStatus = 'neutral',
  actions,
  onEdit,
  onDelete,
}: {
  title: ReactNode;
  badge?: ReactNode;
  badgeStatus?: BadgeStatus;
  /** 우측 임의 액션(업로드·추가 등). onEdit/onDelete 와 함께 쓸 수 있다. */
  actions?: ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex min-h-7 items-center gap-2">
      <span className="text-sm font-semibold text-content">{title}</span>
      {badge != null && <Badge status={badgeStatus}>{badge}</Badge>}
      {(actions || onEdit || onDelete) && (
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {actions}
          {onEdit && (
            <IconButton aria-label="수정" title="수정" size="sm" className="hover:text-primary" onClick={onEdit}>
              <Pencil size={14} />
            </IconButton>
          )}
          {onDelete && (
            <IconButton aria-label="삭제" title="삭제" size="sm" className="hover:text-danger" onClick={onDelete}>
              <Trash2 size={14} />
            </IconButton>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 라벨-값 한 줄 — 라벨(좌, 고정폭 text-xs) + 값(우, text-sm). 값에는 텍스트뿐 아니라
 * `Input`/`Select` 같은 편집 노드도 그대로 넣는다 — 표시 행과 편집 행을 겸한다.
 *
 * 라벨 폭을 여기서만 정하는 이유: 명세 편집기들이 이 구조를 각자 손으로 다시 만들면서
 * w-12·w-14·w-16 세 갈래로 갈렸고, 화면을 옮길 때마다 입력 열이 다른 자리에서 시작했다.
 * 폭은 가장 긴 라벨("이름 패턴", "수용 대상")이 한 줄에 들어가는 w-16 으로 맞춘다.
 */
export function DetailRow({
  label,
  issue,
  hint,
  align = 'center',
  children,
}: {
  label: ReactNode;
  /** 검증 실패 문구 — 값 바로 아래에 붉게. */
  issue?: string | null;
  /** 보조 설명 — 지금 값이 무엇을 뜻하는지(예: "자유형"). */
  hint?: ReactNode;
  /** 세로로 긴 값(체크박스 묶음 등)이면 라벨을 첫 줄에 맞춘다. */
  align?: 'center' | 'start';
  children: ReactNode;
}) {
  return (
    <div className={cn('flex gap-2', align === 'start' ? 'items-start' : 'items-center')}>
      <span className={cn('w-16 shrink-0 text-xs text-content-muted', align === 'start' && 'pt-2')}>{label}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-content">
        {children}
        {issue && <span className="text-xs text-danger">{issue}</span>}
        {hint && <span className="text-xs text-content-faint">{hint}</span>}
      </div>
    </div>
  );
}

/** 카드 하단 보조 설명(어디서 더 보라 등). */
export function DetailNote({ children }: { children: ReactNode }) {
  return <p className="text-xs text-content-faint">{children}</p>;
}
