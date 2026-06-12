import { X, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * 자산 상세 패널 공통 헤더 — 평면도(SidePanel)와 현황(AssetDetailPanel)이 단일 소스로
 * 공유한다. 제목 + (선택)삭제 + 닫기. 두 진입점이 픽셀 단위로 동일하게 보이고, 한 곳만
 * 고치면 양쪽이 함께 바뀌도록(분산 관리로 미묘하게 달라지던 문제 제거).
 */
export function DetailPanelHeader({
  title,
  onClose,
  onDelete,
  extra,
}: {
  title: ReactNode;
  onClose: () => void;
  /** 있으면 삭제 버튼 노출(휴지통). */
  onDelete?: () => void;
  /** 제목 우측·닫기 좌측 보조 요소(예: 스냅샷 등 특수 액션). */
  extra?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-surface-2 shrink-0">
      <h3 className="text-base font-semibold text-content truncate min-w-0">{title}</h3>
      <div className="flex items-center gap-2 shrink-0">
        {extra}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            title="삭제"
            aria-label="삭제"
            className="press-btn p-1 rounded text-content-faint hover:text-danger hover:bg-danger-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
          >
            <Trash2 size={15} />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          title="닫기"
          className="press-btn focus-ring p-1 rounded text-content-muted hover:bg-surface-2"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
