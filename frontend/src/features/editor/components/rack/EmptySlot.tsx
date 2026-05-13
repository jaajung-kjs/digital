import { useRef } from 'react';

interface Props {
  slotIndex: number;
  onClick: (anchor: DOMRect) => void;
}

/**
 * 빈 슬롯. 자기 grid row 를 explicit 으로 선언해서
 * 다른 explicit-placed 아이템(드래그 인디케이터 등) 의 영향을 안 받는다.
 */
export function EmptySlot({ slotIndex, onClick }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={() => {
        if (!ref.current) return;
        onClick(ref.current.getBoundingClientRect());
      }}
      style={{
        gridRowStart: slotIndex + 1,
        gridRowEnd: slotIndex + 2,
        gridColumnStart: 1,
        gridColumnEnd: 2,
      }}
      className="flex items-center justify-center min-h-0 overflow-hidden text-[11px] text-gray-300 border border-dashed border-gray-200 rounded transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-500 cursor-pointer opacity-75 hover:opacity-100"
      title={`슬롯 ${slotIndex} — 클릭해서 추가`}
    >
      + 추가
    </div>
  );
}
