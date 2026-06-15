import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SlimAssetDTO } from '../../trace/traceGraph';

interface Props {
  anchorRect: DOMRect;
  peerOfds: SlimAssetDTO[];
  initialCores?: number;
  onPick: (peer: SlimAssetDTO, cores: number) => void;
  onCancel: () => void;
}

const POPOVER_WIDTH = 232;
const GAP = 6;

/**
 * OFD 경로 추가 팝오버 — CategoryComboboxPopover 앵커 스타일을 그대로 차용.
 * 빈 슬롯 클릭 시 anchorRect 기준으로 화면에 fixed 배치.
 * 상단: 코어 수 선택(24/48 + 자유 입력). 하단: 대국 OFD 목록.
 */
export function OfdRoutePopover({ anchorRect, peerOfds, initialCores = 24, onPick, onCancel }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [cores, setCores] = useState(initialCores);

  // 열릴 때 첫 버튼으로 포커스, 닫힐 때 복원.
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const firstButton = ref.current?.querySelector('button');
    firstButton?.focus();
    return () => {
      previousFocusRef.current?.focus?.();
    };
  }, []);

  // 바깥 클릭 / ESC 닫기 — CategoryComboboxPopover 와 동일 패턴.
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

  // 좌우 배치 결정 — CategoryComboboxPopover 와 동일 로직.
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

  const [layout, setLayout] = useState<{ top: number; tailY: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight;
    const vh = window.innerHeight;
    let nextTop = anchorRect.top;
    if (nextTop + h > vh - 8) nextTop = Math.max(8, anchorRect.bottom - h);
    const slotCenter = (anchorRect.top + anchorRect.bottom) / 2;
    const tailY = Math.max(14, Math.min(h - 14, slotCenter - nextTop));
    setLayout({ top: nextTop, tailY });
  }, [anchorRect.top, anchorRect.bottom, peerOfds.length]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="경로 추가"
      className="fixed z-50 bg-surface border border-line rounded-md shadow-lg py-1 w-[232px]"
      style={{
        left,
        top: layout?.top ?? -9999,
        visibility: layout === null ? 'hidden' : 'visible',
      }}
    >
      {/* Speech-bubble tail */}
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

      {/* 코어 수 선택 */}
      <div className="px-3 py-1.5 border-b border-line">
        <div className="flex items-center gap-1.5 text-[11px] text-content-muted flex-wrap">
          <span className="shrink-0">코어 수</span>
          {[24, 48].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCores(n)}
              className={`rounded border px-2 py-0.5 text-xs font-mono ${
                cores === n
                  ? 'border-primary bg-info-bg text-primary'
                  : 'border-line text-content-muted hover:bg-surface-2'
              }`}
            >
              {n}
            </button>
          ))}
          <input
            type="number"
            min={1}
            value={cores}
            onChange={(e) => setCores(Math.max(1, Number(e.target.value) || 1))}
            className="w-14 rounded border border-line px-1 text-xs font-mono"
            aria-label="코어 수 직접 입력"
          />
        </div>
      </div>

      {/* 대국 OFD 목록 */}
      <div className="px-2 py-0.5 text-[10px] text-content-faint border-b border-line/50">
        대국 OFD 선택
      </div>
      {peerOfds.length === 0 ? (
        <div className="px-3 py-2 text-xs text-content-faint">대국 OFD 없음</div>
      ) : (
        <ul className="max-h-[50vh] overflow-y-auto">
          {peerOfds.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => onPick(o, cores)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-surface-2 text-left"
              >
                <span
                  aria-hidden
                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0 border border-black/40"
                  style={{
                    background: 'var(--eq-1)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
                  }}
                />
                <span className="truncate flex-1">{o.substationName ?? o.name} 대국</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
