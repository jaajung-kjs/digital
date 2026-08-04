import { useEffect, type ReactNode } from 'react';
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

export function Modal({ open, onClose, title, children, footer, size = 'md', className }: ModalProps) {
  // Esc 로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  // 다이얼로그의 접근 가능한 이름 — 스크린리더가 열릴 때 무엇의 대화상자인지 읽는다.
  // 제목이 이미 화면에 있으므로 새 텍스트를 만들지 않고 그것을 가리킨다.
  const titleId = 'modal-title';

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-[var(--overlay)]"
      onClick={onClose}
    >
      <Card
        padding={false}
        className={cn('mx-4 w-full hover:!bg-surface active:!bg-surface cursor-default', size === 'sm' ? 'max-w-[360px]' : 'max-w-md', className)}
        role="dialog"
        aria-modal="true"
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
