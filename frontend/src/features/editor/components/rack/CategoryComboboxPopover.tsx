import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRackModuleCategories } from '../../../rack/hooks/useRackModuleCategories';
import type { RackModuleCategory } from '../../../../types/rackModule';

interface Props {
  anchorRect: DOMRect;
  availableSpan: number;
  onPick: (category: RackModuleCategory) => void;
  onCancel: () => void;
}

const POPOVER_WIDTH = 224; // tailwind w-56
const GAP = 6;

export function CategoryComboboxPopover({ anchorRect, availableSpan, onPick, onCancel }: Props) {
  const { data: categories } = useRackModuleCategories();
  const ref = useRef<HTMLDivElement | null>(null);
  // 팝오버 열기 직전 포커스를 잡아뒀다가 닫힘 시 복원.
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    // 첫 옵션으로 자동 포커스 — 키보드 사용자 친화.
    const firstButton = ref.current?.querySelector('button');
    firstButton?.focus();
    return () => {
      previousFocusRef.current?.focus?.();
    };
  }, []);

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
  // 좌측 공간이 모자라면 슬롯 오른쪽으로, 양쪽 다 안 되면 슬롯 위 (left=slot.left).
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  let left: number;
  let placement: 'left' | 'right' | 'top';
  if (anchorRect.left - POPOVER_WIDTH - GAP >= 8) {
    left = anchorRect.left - POPOVER_WIDTH - GAP;
    placement = 'left';
  } else if (anchorRect.right + GAP + POPOVER_WIDTH <= vw - 8) {
    left = anchorRect.right + GAP;
    placement = 'right';
  } else {
    left = Math.max(8, anchorRect.left);
    placement = 'top';
  }

  // 세로 위치 + 꼬리 위치는 measured height 기반. 첫 paint 전엔 visibility hidden
  // 으로 가려 측정 전 위치 노출 방지.
  const [layout, setLayout] = useState<{ top: number; tailY: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight;
    const vh = window.innerHeight;
    // 기본: slot top 정렬. viewport bottom 을 넘치면 slot bottom 에 popover
    // bottom 을 맞춤 — popover 가 slot 위쪽으로 뻗어 올라감.
    let nextTop = anchorRect.top;
    if (nextTop + h > vh - 8) nextTop = Math.max(8, anchorRect.bottom - h);
    // 꼬리는 항상 slot 의 세로 중심을 가리킴. popover rounded corner 밖으로
    // 나가지 않게 outer 꼬리 size (12px) 만큼 안쪽으로 clamp.
    const slotCenter = (anchorRect.top + anchorRect.bottom) / 2;
    const tailY = Math.max(14, Math.min(h - 14, slotCenter - nextTop));
    setLayout({ top: nextTop, tailY });
  }, [anchorRect.top, anchorRect.bottom, active.length]);

  return (
    <div
      ref={ref}
      role="listbox"
      className="fixed z-50 bg-white border border-gray-200 rounded-md shadow-lg py-1 w-56"
      style={{
        left,
        top: layout?.top ?? -9999,
        visibility: layout === null ? 'hidden' : 'visible',
      }}
    >
      {/* Speech-bubble tail — CSS triangle 두 겹. 바깥 (테두리 색) 위에 안쪽
          (흰색) 을 1px 덧대어 popover 의 border 가 꼬리 base 자리에서 자연스럽게
          끊기게. placement === 'top' (양옆 다 부족) 인 드문 케이스는 꼬리 생략. */}
      {layout && placement !== 'top' && (
        <>
          <div
            aria-hidden
            className="absolute pointer-events-none"
            style={{
              top: layout.tailY,
              marginTop: -12,
              width: 0,
              height: 0,
              borderTop: '12px solid transparent',
              borderBottom: '12px solid transparent',
              ...(placement === 'left'
                ? { left: '100%', borderLeft: '12px solid rgb(229, 231, 235)' }
                : { right: '100%', borderRight: '12px solid rgb(229, 231, 235)' }),
            }}
          />
          <div
            aria-hidden
            className="absolute pointer-events-none"
            style={{
              top: layout.tailY,
              marginTop: -11,
              width: 0,
              height: 0,
              borderTop: '11px solid transparent',
              borderBottom: '11px solid transparent',
              ...(placement === 'left'
                ? { left: '100%', marginLeft: -1, borderLeft: '11px solid white' }
                : { right: '100%', marginRight: -1, borderRight: '11px solid white' }),
            }}
          />
        </>
      )}
      <div className="px-3 py-1 text-[11px] text-gray-500 border-b">
        카테고리 선택 — {availableSpan}슬롯 가능
      </div>
      {active.length === 0 ? (
        <div className="px-3 py-2 text-xs text-gray-400">카테고리가 없습니다.</div>
      ) : (
        <ul className="max-h-[80vh] overflow-y-auto">
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
