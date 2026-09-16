import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { BackgroundDrawing } from '@twin/core';
import { DetailCardHeader } from '../../../components/ui';

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

export interface LegendEntry {
  /** 케이블 그룹 키 — 끄고 켜는 것이 이 키를 가리킨다. */
  key: string;
  label: string;
  color: string;
}

export function PlanRail({
  legend, hiddenGroups, onToggleGroup, drawing, hidden, onToggle, onShowAll, opacity, onOpacity,
}: {
  /** 이 층에 **실제로 있는** 매체만 — 자료에서 유도한다. */
  legend: readonly LegendEntry[];
  /** 꺼 둔 케이블 그룹 키. */
  hiddenGroups: ReadonlySet<string>;
  onToggleGroup: (key: string) => void;
  /** 배경 도면 — 없으면 레이어 절이 통째로 빠진다. */
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
  const offCount = layers.filter((l) => hidden.has(l.name)).length;

  return (
    <Rail>
      <div className="flex max-h-[42vh] flex-col border-t border-line-strong text-xs">
        {/* ── 케이블 ──
            범례는 **읽는 것이자 끄는 것**이다. 색만 적어 두면 「빨간 게 전원이구나」에서
            끝나지만, 누를 수 있으면 「전원만 빼고 보자」가 된다 — 아래 도면 레이어와 같은
            일을 케이블에 대해 한다. 이 층에 실제로 있는 매체만 선다(자료에서 유도). */}
        <DetailCardHeader title="케이블" className="shrink-0" />
        {legend.length === 0 ? (
          <div className="shrink-0 px-3 py-1.5 text-content-faint">이 층에 그려진 케이블이 없습니다</div>
        ) : (
          <ul className="shrink-0">
            {legend.map((e) => (
              <li key={e.key}>
                <label className="flex cursor-pointer items-center gap-2 px-3 py-1 hover:bg-surface-2">
                  <input
                    type="checkbox"
                    className="size-3.5"
                    checked={!hiddenGroups.has(e.key)}
                    onChange={() => onToggleGroup(e.key)}
                  />
                  <span aria-hidden className="h-[2px] w-5 shrink-0" style={{ background: e.color }} />
                  <span className="min-w-0 flex-1 truncate text-content">{e.label}</span>
                </label>
              </li>
            ))}
            {/* 정면은 끌 것이 아니라 읽는 것이다 — 색이 아니라 굵기로 말하므로 여기 함께 적는다. */}
            <li className="flex items-center gap-2 px-3 py-1 pl-[34px] text-content-muted">
              <span aria-hidden className="h-[3px] w-5 shrink-0 bg-content" />
              정면
            </li>
          </ul>
        )}

        {/* ── 배경 도면 ── */}
        {drawing && (
          <>
            <DetailCardHeader
              title="배경 도면"
              className="shrink-0 border-t"
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
