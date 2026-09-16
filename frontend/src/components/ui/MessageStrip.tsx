import type { ReactNode } from 'react';
import { AlertTriangle, Info, XCircle } from 'lucide-react';
import { cn } from './cn';

type Tone = 'info' | 'warning' | 'danger';

const TONE: Record<Tone, { box: string; icon: string; Icon: typeof Info }> = {
  info: { box: 'border-info bg-info-bg text-content', icon: 'text-info', Icon: Info },
  warning: { box: 'border-warning bg-warning-bg text-content', icon: 'text-warning', Icon: AlertTriangle },
  danger: { box: 'border-danger bg-danger-bg text-content', icon: 'text-danger', Icon: XCircle },
};

/**
 * 화면이 사용자에게 **사정을 알리는 띠** — 제약·경고·실패.
 *
 * 예전에는 이런 것이 컨테이너도 아이콘도 배경도 없이 맨 문장으로 떠 있었다. 장비 품목을
 * 고르면 편집 바 위 여백에 `[8개 사용 중] 포트 구조는 변경할 수 없습니다` 가 **빨간 글자**로
 * 섰는데, 이건 사용자가 낸 오류가 아니라 그냥 사정이다. **빨강은 사용자가 고칠 수 있는
 * 오류에만** 쓴다 — 고칠 수 없는 것을 빨갛게 칠하면 빨강이 아무 뜻도 없어진다.
 *
 * SAP Fiori `MessageStrip`·Carbon `InlineNotification`·Ant `Alert` 과 같은 자리, 같은 구성:
 * 아이콘 + 톤 배경 + 테두리 + 내용 폭 전체.
 */
export function MessageStrip({
  tone = 'info',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  const { box, icon, Icon } = TONE[tone];
  return (
    <div className={cn('flex items-start gap-2 rounded border px-3 py-2 text-sm', box, className)}>
      <Icon size={14} className={cn('mt-0.5 shrink-0', icon)} aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
