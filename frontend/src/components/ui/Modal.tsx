import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from './cn';
import { Card } from './Card';
import { IconButton } from './IconButton';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** 패널 최대 폭 — md(기본, max-w-md=448px) / sm(360px). 폭 매직넘버의 단일 소스. */
  size?: 'sm' | 'md';
  /** 패널에 추가 className */
  className?: string;
}

/** 초점이 갈 수 있는 것들 — 트랩이 순환시킬 대상. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, children, footer, size = 'md', className }: ModalProps) {
  /* 제목은 이미 화면에 있으므로 새 글자를 만들지 않고 그것을 가리킨다. `useId` 인 이유:
     고정 문자열이면 모달이 둘 열렸을 때 두 대화상자가 같은 이름을 가리킨다. */
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  /**
   * Esc 로 닫고, **Tab 이 상자 밖으로 새지 않게** 한다.
   *
   * 트랩이 없으면 Tab 을 누르는 순간 초점이 뒤에 깔린 화면으로 빠져나간다 — 화면은 막혀
   * 있는데 초점만 그 아래를 돌아다니므로, 키보드·스크린리더 사용자는 자기가 어디 있는지
   * 알 수 없다(WAI-ARIA APG Dialog).
   */
  useEffect(() => {
    if (!open) return;
    /* 닫힌 뒤에는 **열기 전 있던 자리**로 초점을 돌려준다 — 안 그러면 body 로 튕겨
       처음부터 다시 Tab 해야 한다. */
    const opener = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const edge = e.shiftKey ? items[0]! : items[items.length - 1]!;
      if (document.activeElement !== edge) return;
      e.preventDefault();
      (e.shiftKey ? items[items.length - 1]! : items[0]!).focus();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-[var(--overlay)]"
      onClick={onClose}
    >
      <Card
        padding={false}
        className={cn('mx-4 w-full hover:!bg-surface active:!bg-surface cursor-default', size === 'sm' ? 'max-w-[360px]' : 'max-w-md', className)}
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 id={titleId} className="text-sm font-semibold text-content">{title}</h2>
          <IconButton aria-label="닫기" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="px-4 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>
        )}
      </Card>
    </div>
  );
}
