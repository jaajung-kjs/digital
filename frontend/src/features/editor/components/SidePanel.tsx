import { useEffect, type ReactNode } from 'react';
import { DetailPanelHeader } from '../../../components/DetailPanelHeader';

interface SidePanelProps {
  /** 캔버스 어느 쪽에 붙고 어디서 슬라이드해 들어올지 */
  side?: 'left' | 'right';
  /** 헤더 타이틀 */
  title: ReactNode;
  /** 닫기(X)·ESC 공통 핸들러 */
  onClose: () => void;
  /** 있으면 헤더에 삭제(휴지통) 노출 */
  onDelete?: () => void;
  /** 패널 너비(px) */
  width?: number;
  /** 본문 */
  children: ReactNode;
  /** 타이틀 우측, 닫기 버튼 좌측에 들어갈 헤더 보조 요소(예: kind 뱃지) */
  headerExtra?: ReactNode;
}

/**
 * 평면도 편집기의 좌/우 슬라이드 패널 공통 셸.
 *
 * 그간 상세·설계서·이력·배경 패널이 각자 다른 슬라이드 애니메이션/z-index/배경·
 * 테두리/ESC 처리를 들고 있었다("여러 저자" 불일치). 이 셸이 그 외형(위치/슬라이드/
 * 토큰/헤더/ESC)을 단일화하고, 각 패널은 본문 로직만 children 으로 넘긴다.
 *
 * 슬라이드 방향은 `side` 와 일치한다 — 우측 패널은 오른쪽에서, 좌측 패널은 왼쪽에서.
 * (설계서가 우측인데 left-slide 하던 버그가 여기서 구조적으로 사라진다.)
 */
export function SidePanel({
  side = 'right',
  title,
  onClose,
  onDelete,
  width = 384,
  children,
  headerExtra,
}: SidePanelProps) {
  // ESC 로 닫기 — 모달/라이트박스(fixed inset-0 오버레이)가 떠 있으면 무시.
  // 상세 패널이 쓰던 가드를 그대로 이관했다.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const overlays = document.querySelectorAll('[class*="fixed inset-0"]');
      if (overlays.length > 0) return;
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const isRight = side === 'right';

  return (
    <div
      data-side={side}
      style={{ width }}
      className={[
        'absolute inset-y-0 z-20 flex flex-col bg-surface',
        isRight
          ? 'right-0 border-l border-line shadow-[-4px_0_12px_rgba(0,0,0,0.08)] animate-slide-in-right'
          : 'left-0 border-r border-line shadow-[4px_0_12px_rgba(0,0,0,0.08)] animate-slide-in-left',
      ].join(' ')}
    >
      {/* 공통 헤더 — 현황 패널과 단일 소스(DetailPanelHeader) */}
      <DetailPanelHeader title={title} onClose={onClose} onDelete={onDelete} extra={headerExtra} />

      {/* 본문 */}
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
    </div>
  );
}
