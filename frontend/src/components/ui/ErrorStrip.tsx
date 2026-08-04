import { X } from 'lucide-react';
import { IconButton } from './IconButton';
import { cn } from './cn';

interface ErrorStripProps {
  /** null/빈 문자열이면 아무것도 렌더하지 않는다 — 호출부의 `{error && …}` 를 없앤다. */
  message?: string | null;
  /** 주면 닫기 버튼이 뜬다. 없으면 문구만 표시(자동 소멸하는 곳). */
  onDismiss?: () => void;
  className?: string;
}

/**
 * 한 줄짜리 오류 문구 + 닫기 — SaveBar·카탈로그 패널·전역 알림이 공유하는 형태.
 *
 * 이 셋이 각자 같은 마크업(`flex` + `text-xs text-danger` + 닫기 IconButton)을
 * 갖고 있어 아이콘 크기만 미묘하게 달랐다. 한 곳으로 모은다.
 */
export function ErrorStrip({ message, onDismiss, className }: ErrorStripProps) {
  if (!message) return null;
  return (
    <div className={cn('flex items-center gap-1', className)} role="alert">
      <span className="flex-1 text-xs text-danger">{message}</span>
      {onDismiss && (
        <IconButton aria-label="오류 닫기" onClick={onDismiss}>
          <X size={12} />
        </IconButton>
      )}
    </div>
  );
}
