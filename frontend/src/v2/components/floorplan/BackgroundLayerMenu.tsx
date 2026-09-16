import { useRef, useState } from 'react';
import { Button, useDismissOnOutside } from '../../../components/ui';
import type { BackgroundDrawing } from '@twin/core';

/**
 * 배경 도면의 **레이어를 켜고 끈다**.
 *
 * 임포터는 처음부터 레이어를 이름·색·표시여부까지 저장하고 있었고 렌더러도 `hiddenLayers`
 * 를 받고 있었는데, **화면에 그 패널이 없어서 쓰이지 못했다.** 만든 것이 아니라 드러낸 것이다.
 *
 * 실물 도면은 레이어가 스물다섯 장씩 된다(`DIM`·`RXDIM`·`TEXT`·`DEFPOINTS` 처럼 주기용이
 * 절반이다). 그것이 전부 깔린 채로는 우리 설비가 도면 속에 묻힌다 — CAD 가 레이어 토글을
 * 맨 앞에 두는 까닭이 이것이다.
 *
 * **목록이 길어져도 도구바는 한 줄이다**(§1.6) — 단추 하나에 목록은 떠 있는 상자 안으로.
 */
export function BackgroundLayerMenu({
  drawing, hidden, onToggle, onShowAll, opacity, onOpacity,
}: {
  drawing: BackgroundDrawing;
  /** 지금 꺼 둔 레이어 이름들. */
  hidden: ReadonlySet<string>;
  onToggle: (name: string) => void;
  onShowAll: () => void;
  /** 0~1. 배경은 **참고**이므로 우리 설비보다 흐려야 한다. */
  opacity: number;
  onOpacity: (v: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  useDismissOnOutside(open, [boxRef], () => setOpen(false));

  /* 도면이 실제로 그리는 레이어만 세운다 — 파일에는 선언돼 있지만 아무것도 안 그리는
     레이어가 흔하다(`DEFPOINTS` 가 그렇다). 빈 줄을 스물다섯 개 늘어놓지 않는다. */
  const used = new Set<string>();
  for (const p of drawing.paths) used.add(p.layer);
  for (const t of drawing.texts) used.add(t.layer);
  for (const f of drawing.filled ?? []) used.add(f.layer);
  const layers = drawing.layers.filter((l) => used.has(l.name));
  const offCount = layers.filter((l) => hidden.has(l.name)).length;

  return (
    <div ref={boxRef} className="relative">
      <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
        레이어
        {offCount > 0 && <span className="ml-1 text-content-faint">{layers.length - offCount}/{layers.length}</span>}
      </Button>
      {open && (
        <div className="absolute left-0 top-full z-modal mt-1 w-60 border border-line-strong bg-surface shadow-md">
          <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-2.5 py-1.5">
            <span className="text-xs font-bold text-content-muted">배경 농도</span>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={Math.round(opacity * 100)}
              aria-label="배경 농도"
              className="min-w-0 flex-1"
              onChange={(e) => onOpacity(Number(e.currentTarget.value) / 100)}
            />
            <span className="w-8 shrink-0 text-right text-xs tabular-nums text-content">{Math.round(opacity * 100)}%</span>
          </div>
          <div className="flex items-center justify-between border-b border-line bg-surface-2 px-2.5 py-1">
            <span className="text-xs font-bold text-content-muted">레이어 {layers.length}</span>
            <button
              type="button"
              className="text-xs text-primary hover:underline disabled:text-content-faint"
              disabled={offCount === 0}
              onClick={onShowAll}
            >
              모두 켜기
            </button>
          </div>
          <ul className="max-h-64 overflow-y-auto">
            {layers.map((l) => (
              <li key={l.name}>
                <label className="flex cursor-pointer items-center gap-2 px-2.5 py-1 text-sm hover:bg-surface-2">
                  <input
                    type="checkbox"
                    className="size-3.5"
                    checked={!hidden.has(l.name)}
                    onChange={() => onToggle(l.name)}
                  />
                  {/* 도면이 그 레이어에 쓰는 색 — CAD 에서 레이어를 색으로 기억하기 때문이다. */}
                  <span aria-hidden className="size-2.5 shrink-0 border border-line" style={{ background: l.color }} />
                  <span className="min-w-0 flex-1 truncate">{l.name}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
