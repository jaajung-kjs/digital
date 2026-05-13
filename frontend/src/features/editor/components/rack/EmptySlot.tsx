import { useRef } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { RACK_SLOT_COUNT } from '../../../../types/rackModule';

interface Props {
  slotIndex: number;
  onClick: (anchor: DOMRect) => void;
}

/**
 * 빈 슬롯. explicit grid 위치로 배치되어 드래그 인디케이터와 충돌하지 않는다.
 * 키보드(Enter/Space) 활성화 + 슬롯 번호 포함 aria-label 로 a11y 보장.
 * 드래그 중에는 hover 효과를 꺼서 시각 노이즈를 제거.
 */
export function EmptySlot({ slotIndex, onClick }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const isDragging = useEditorStore((s) => s.isDraggingRackModule);

  const trigger = () => {
    if (!ref.current) return;
    onClick(ref.current.getBoundingClientRect());
  };

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
      className={`flex items-center justify-center min-h-0 overflow-hidden text-[11px] text-gray-300 border border-dashed border-gray-200 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 cursor-pointer opacity-75 ${
        isDragging
          ? ''
          : 'hover:border-blue-400 hover:bg-blue-50 hover:text-blue-500 hover:opacity-100'
      }`}
      aria-label={`슬롯 ${slotIndex + 1}/${RACK_SLOT_COUNT} — 모듈 추가`}
      title={`슬롯 ${slotIndex + 1} — 클릭해서 추가`}
    >
      + 추가
    </div>
  );
}
