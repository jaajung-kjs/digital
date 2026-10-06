import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { BackgroundDrawing } from '@twin/core';
import { DetailCardHeader } from '../../../components/ui';

/**
 * 배경 도면 정보 — **트리 아래, 도면 옆**(농도·레이어).
 *
 * 자리는 페이지가 내주고(`target`) 내용은 평면도가 채운다. 평면도를 떠나면 자리가 저절로 빈다.
 * 농도는 자료라 워킹카피에 오르고(`onOpacity`), 레이어 끄기는 보는 방식이라 화면이 든다(§3.3).
 */
export function PlanBackgroundRail({
  target, drawing, hidden, onToggle, onShowAll, opacity, onOpacity,
}: {
  target: HTMLElement | null;
  drawing: BackgroundDrawing | null;
  hidden: ReadonlySet<string>;
  onToggle: (name: string) => void;
  onShowAll: () => void;
  opacity: number;
  onOpacity: (v: number) => void;
}) {
  /* 도면이 실제로 그리는 레이어만 — 선언만 있고 아무것도 안 그리는 것이 흔하다(`DEFPOINTS`). */
  const layers = useMemo(() => {
    if (!drawing) return [];
    const used = new Set<string>();
    for (const p of drawing.paths) used.add(p.layer);
    for (const t of drawing.texts) used.add(t.layer);
    for (const f of drawing.filled ?? []) used.add(f.layer);
    return drawing.layers.filter((l) => used.has(l.name));
  }, [drawing]);
  if (!target || !drawing) return null;
  const offCount = layers.filter((l) => hidden.has(l.name)).length;

  return createPortal(
    <div className="flex max-h-[42vh] flex-col border-t border-line-strong text-xs">
      <DetailCardHeader
        title="배경 도면"
        className="shrink-0"
        actions={<span className="min-w-0 truncate text-xs text-content-faint">{drawing.source.fileName}</span>}
      />
      <div className="flex shrink-0 items-center gap-2 px-3 py-1.5">
        <span className="shrink-0 text-content-muted">농도</span>
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
        <span className="w-8 shrink-0 text-right tabular-nums text-content">{Math.round(opacity * 100)}%</span>
      </div>
      <DetailCardHeader
        title={`레이어 ${layers.length - offCount}/${layers.length}`}
        className="shrink-0 border-t"
        actions={
          <button
            type="button"
            className="text-xs text-primary hover:underline disabled:text-content-faint"
            disabled={offCount === 0}
            onClick={onShowAll}
          >
            모두 켜기
          </button>
        }
      />
      {/* 레이어가 스물 장을 넘겨도 트리를 밀어내지 않는다 — 목록만 제 안에서 흐른다. */}
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {layers.map((l) => (
          <li key={l.name}>
            <label className="flex cursor-pointer items-center gap-2 px-3 py-1 hover:bg-surface-2">
              <input type="checkbox" className="size-3.5" checked={!hidden.has(l.name)} onChange={() => onToggle(l.name)} />
              {/* 도면이 그 레이어에 쓰는 색 — CAD 에서 레이어는 색으로 기억된다. */}
              <span aria-hidden className="size-2.5 shrink-0 border border-line" style={{ background: l.color }} />
              <span className="min-w-0 flex-1 truncate text-content">{l.name}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>,
    target,
  );
}
