import { useEffect, useRef } from 'react';
import { useRackModuleCategories } from '../../../rack/hooks/useRackModuleCategories';
import type { RackModuleCategory } from '../../../../types/rackModule';

interface Props {
  anchorRect: DOMRect;
  availableSpan: number;
  onPick: (category: RackModuleCategory) => void;
  onCancel: () => void;
}

export function CategoryComboboxPopover({ anchorRect, availableSpan, onPick, onCancel }: Props) {
  const { data: categories } = useRackModuleCategories();
  const ref = useRef<HTMLDivElement | null>(null);

  // 바깥 클릭 / ESC 로 닫기
  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCancel();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onCancel]);

  const active = (categories ?? []).filter((c) => c.isActive);

  return (
    <div
      ref={ref}
      role="listbox"
      className="fixed z-50 bg-white border border-gray-200 rounded-md shadow-lg py-1 w-56"
      style={{
        left: anchorRect.right + 4,
        top: anchorRect.top,
      }}
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
