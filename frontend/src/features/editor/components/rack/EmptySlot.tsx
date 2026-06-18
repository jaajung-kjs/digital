import { useRef } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { RACK_SLOT_COUNT } from '../../../../types/rackModule';

interface Props {
  slotIndex: number;
  /** popover 가 이 슬롯에서 열려 있을 때 true — hover 효과를 잠금처럼 유지. */
  isActive?: boolean;
  onClick: (anchor: DOMRect) => void;
}

/**
 * 빈 슬롯. explicit grid 위치로 배치되어 드래그 인디케이터와 충돌하지 않는다.
 * 키보드(Enter/Space) 활성화 + 슬롯 번호 포함 aria-label 로 a11y 보장.
 * 드래그 중에는 hover 효과를 꺼서 시각 노이즈를 제거.
 */
export function EmptySlot({ slotIndex, isActive, onClick }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const isDragging = useEditorStore((s) => s.isDraggingRackModule);

  const trigger = () => {
    if (!ref.current) return;
    onClick(ref.current.getBoundingClientRect());
  };

  const activeClasses = 'border-primary bg-info-bg text-primary ring-1 ring-inset ring-primary';
  const hoverClasses = 'hover:border-primary hover:bg-info-bg hover:text-primary';

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={trigger}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          trigger();
        }
      }}
      style={{
        gridRowStart: slotIndex + 1,
        gridRowEnd: slotIndex + 2,
        gridColumnStart: 1,
        gridColumnEnd: 2,
        // 드래그 중에는 인디케이터만 보이도록 빈 슬롯은 hover 효과 차단.
        pointerEvents: isDragging ? 'none' : undefined,
      }}
      className={`group/slot flex items-center justify-center min-h-0 overflow-hidden text-xs text-content-faint bg-surface/40 border border-dashed border-line rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 cursor-pointer ${
        isActive ? activeClasses : isDragging ? '' : hoverClasses
      }`}
      aria-label={`슬롯 ${slotIndex + 1}/${RACK_SLOT_COUNT} — 모듈 추가`}
      title={`슬롯 ${slotIndex + 1} — 클릭해서 추가`}
    >
      <span className="opacity-0 group-hover/slot:opacity-100 transition-opacity">+ 추가</span>
    </div>
  );
}
