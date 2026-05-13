import { useEffect, useRef } from 'react';
import { useRackModuleCategories } from '../../../rack/hooks/useRackModuleCategories';
import type { RackModuleCategory } from '../../../../types/rackModule';

interface Props {
  anchorRect: DOMRect;
  availableSpan: number;
  onPick: (category: RackModuleCategory) => void;
  onCancel: () => void;
}

const POPOVER_WIDTH = 224; // tailwind w-56
const POPOVER_MAX_HEIGHT = 320; // listbox + header padding
const GAP = 6;

export function CategoryComboboxPopover({ anchorRect, availableSpan, onPick, onCancel }: Props) {
  const { data: categories } = useRackModuleCategories();
  const ref = useRef<HTMLDivElement | null>(null);

  // 바깥 클릭 / ESC 로 닫기.
  // - mousedown은 한 틱 늦게 등록해서 슬롯 클릭이 즉시 popover를 닫는 일을 막는다.
  // - keydown은 capture 단계로 등록 + stopImmediatePropagation 으로
  //   상위 EquipmentDetailPanel 의 ESC 핸들러가 panel 까지 닫는 일을 막는다.
  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCancel();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onCancel();
      }
    };
    const armTimer = window.setTimeout(() => {
      document.addEventListener('mousedown', handleDown);
    }, 0);
    document.addEventListener('keydown', handleKey, { capture: true });
    return () => {
      window.clearTimeout(armTimer);
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleKey, { capture: true });
    };
  }, [onCancel]);

  const active = (categories ?? []).filter((c) => c.isActive);

  // 슬롯이 화면 오른쪽 패널 안에 있으므로 기본은 왼쪽으로 띄움.
  // 좌측 공간이 모자라면 슬롯 위/아래로 떨어트림.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  let left = anchorRect.left - POPOVER_WIDTH - GAP;
  let top = anchorRect.top;
  if (left < 8) {
    // 왼쪽 공간 부족 → 오른쪽으로 시도
    left = anchorRect.right + GAP;
    if (left + POPOVER_WIDTH > vw - 8) {
      // 양쪽 다 안 되면 슬롯 위쪽에 띄움
      left = Math.max(8, anchorRect.left);
      top = anchorRect.top - POPOVER_MAX_HEIGHT - GAP;
      if (top < 8) top = anchorRect.bottom + GAP;
    }
  }
  // 세로도 화면 안에 맞춤
  top = Math.min(top, vh - POPOVER_MAX_HEIGHT - 8);
  top = Math.max(8, top);

  return (
    <div
      ref={ref}
      role="listbox"
      className="fixed z-50 bg-white border border-gray-200 rounded-md shadow-lg py-1 w-56"
      style={{ left, top }}
    >
      <div className="px-3 py-1 text-[11px] text-gray-500 border-b">
        카테고리 선택 — {availableSpan}슬롯 가능
      </div>
      {active.length === 0 ? (
        <div className="px-3 py-2 text-xs text-gray-400">카테고리가 없습니다.</div>
      ) : (
        <ul className="max-h-72 overflow-y-auto">
          {active.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPick(c)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 text-left"
              >
                <span
                  aria-hidden
                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0 ring-1 ring-black/5"
                  style={{ backgroundColor: c.displayColor ?? '#9ca3af' }}
                />
                <span className="truncate flex-1">{c.name}</span>
                <span className="text-[10px] text-gray-400">{c.defaultSlotSpan}U</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
