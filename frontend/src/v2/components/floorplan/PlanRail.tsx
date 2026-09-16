import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { BackgroundDrawing } from '@twin/core';

/**
 * 도면 정보 패널 — **트리 아래, 도면 옆**.
 *
 * 범례·축척·레이어는 도면에 딸린 것이라 도면 곁에 서야 한다. 한때 캔버스 **위에 떠 있게**
 * 했는데 두 가지가 잘못됐다: 위치 기준 조상이 없어 화면 왼쪽 아래(곧 조직 트리 위)로
 * 떨어졌고, 무엇보다 **떠 있는 것은 있는 줄도 모른다** — 레이어를 끄고 켤 수 있다는 사실이
 * 화면 어디에도 보이지 않았다.
 *
 * 자리는 페이지가 내주고(`#v2-plan-rail`) 내용은 평면도가 채운다. 평면도를 떠나면 자리가
 * 저절로 비고, 빈 자리는 접힌다(`empty:hidden`).
 */
function Rail({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  /* 자리는 **마운트 뒤에** 찾는다 — 렌더 도중에 DOM 을 뒤지면 아직 없을 수 있다. */
  useEffect(() => setSlot(document.getElementById('v2-plan-rail')), []);
  if (!slot) return null;
  return createPortal(children, slot);
}

/** 축척 바가 고를 수 있는 길이(cm) — 타일(60cm)의 배수로만 센다. */
const BAR_LENGTHS_CM = [60, 120, 300, 600, 1200, 3000, 6000];
const BAR_TARGET_PX = 96;

export interface LegendEntry {
  label: string;
  color: string;
}

export function PlanRail({
  scale, legend, drawing, hidden, onToggle, onShowAll, opacity, onOpacity,
}: {
  scale: number;
  /** 이 층에 **실제로 있는** 매체만 — 자료에서 유도한다. */
  legend: readonly LegendEntry[];
  /** 배경 도면 — 없으면 레이어 절이 통째로 빠진다. */
  drawing: BackgroundDrawing | null;
  hidden: ReadonlySet<string>;
  onToggle: (name: string) => void;
  onShowAll: () => void;
  opacity: number;
  onOpacity: (v: number) => void;
}) {
  /** 화면에서 96px 언저리가 되는 타일 배수 길이. 배율을 바꾸면 눈금이 따라 는다. */
  const bar = useMemo(() => {
    const cm = BAR_LENGTHS_CM.reduce((best, len) =>
      Math.abs(len * scale - BAR_TARGET_PX) < Math.abs(best * scale - BAR_TARGET_PX) ? len : best,
    BAR_LENGTHS_CM[0]!);
    return { px: cm * scale, label: cm >= 100 ? `${cm / 100} m` : `${cm} cm`, tiles: Math.round(cm / 60) };
  }, [scale]);

  /* 도면이 실제로 그리는 레이어만 — 선언만 있고 아무것도 안 그리는 것이 흔하다(`DEFPOINTS`). */
  const layers = useMemo(() => {
    if (!drawing) return [];
    const used = new Set<string>();
    for (const p of drawing.paths) used.add(p.layer);
    for (const t of drawing.texts) used.add(t.layer);
    for (const f of drawing.filled ?? []) used.add(f.layer);
    return drawing.layers.filter((l) => used.has(l.name));
  }, [drawing]);
  const offCount = layers.filter((l) => hidden.has(l.name)).length;

  return (
    <Rail>
      <div className="flex max-h-[42vh] flex-col border-t border-line-strong text-xs">
        {/* ── 범례 ── */}
        <div className="shrink-0 border-b border-line bg-surface-2 px-3 py-1 font-bold text-content-muted">도면</div>
        <div className="shrink-0 space-y-1.5 px-3 py-2">
          {legend.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-content-muted">
              {legend.map((e) => (
                <span key={e.label} className="flex items-center gap-1.5">
                  <span aria-hidden className="h-[2px] w-5" style={{ background: e.color }} />
                  {e.label}
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="h-[3px] w-5 bg-content" />
                정면
              </span>
            </div>
          )}
          {/* 축척 바 — 눈금은 **타일 배수**다(60cm 한 장). 격자와 같은 말을 한다. */}
          <div className="flex items-center gap-2 text-content-muted">
            <span aria-hidden className="flex h-[7px] border border-content-muted" style={{ width: bar.px }}>
              <span className="flex-1 bg-content-muted" />
              <span className="flex-1" />
            </span>
            <span className="tabular-nums text-content">{bar.label}</span>
            <span className="tabular-nums">타일 {bar.tiles}장</span>
          </div>
        </div>

        {/* ── 배경 도면 ── */}
        {drawing && (
          <>
            <div className="flex shrink-0 items-center gap-2 border-y border-line bg-surface-2 px-3 py-1">
              <span className="font-bold text-content-muted">배경 도면</span>
              <span className="min-w-0 flex-1 truncate text-content-faint">{drawing.source.fileName}</span>
            </div>
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
            <div className="flex shrink-0 items-center justify-between border-y border-line bg-surface-2 px-3 py-1">
              <span className="font-bold text-content-muted">레이어 {layers.length - offCount}/{layers.length}</span>
              <button
                type="button"
                className="text-primary hover:underline disabled:text-content-faint"
                disabled={offCount === 0}
                onClick={onShowAll}
              >
                모두 켜기
              </button>
            </div>
            {/* 레이어가 스물 장을 넘겨도 트리를 밀어내지 않는다 — 목록만 제 안에서 흐른다. */}
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {layers.map((l) => (
                <li key={l.name}>
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-1 hover:bg-surface-2">
                    <input
                      type="checkbox"
                      className="size-3.5"
                      checked={!hidden.has(l.name)}
                      onChange={() => onToggle(l.name)}
                    />
                    {/* 도면이 그 레이어에 쓰는 색 — CAD 에서 레이어는 색으로 기억된다. */}
                    <span aria-hidden className="size-2.5 shrink-0 border border-line" style={{ background: l.color }} />
                    <span className="min-w-0 flex-1 truncate text-content">{l.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Rail>
  );
}
