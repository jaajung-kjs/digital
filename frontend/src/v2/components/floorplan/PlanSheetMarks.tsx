import { useMemo } from 'react';

/**
 * 도면의 **주기 레이어** — 축척 바와 범례.
 *
 * 배치도에는 축척과 범례가 있다. 없으면 격자 한 칸이 몇 m 인지 알 수 없고, 빨간 선이
 * 전원인지 경고인지도 알 수 없다 — 우리 화면이 그랬다(이 층의 케이블이 전부 전원이라
 * 온통 빨갛게 보이는데, 그 사실을 말해 주는 것이 어디에도 없었다).
 *
 * **방위표는 아직 그리지 않는다.** 층마다 방위를 저장하지 않으므로, 북쪽 화살표를 그리면
 * 없는 사실을 도면이 말하게 된다. 층에 방위 값이 생기면 그때 붙인다.
 */

/** 축척 바가 고를 수 있는 길이(cm) — 도면이 쓰는 어림수만. */
const BAR_LENGTHS_CM = [50, 100, 200, 500, 1000, 2000, 5000];

/** 바의 목표 폭(화면 px) — 이 근처가 되는 길이를 고른다. */
const BAR_TARGET_PX = 96;

export interface LegendEntry {
  /** 케이블 그룹 이름 — 「전원」·「광」. */
  label: string;
  color: string;
}

export function PlanSheetMarks({
  /** world→화면 배율(px/cm). */
  scale,
  /** 이 층에 **실제로 있는** 매체만. 손으로 관리하지 않는다 — 자료에서 유도한다. */
  legend,
}: {
  scale: number;
  legend: readonly LegendEntry[];
}) {
  /** 화면에서 96px 언저리가 되는 어림수 길이. 배율을 바꾸면 눈금이 따라 는다. */
  const bar = useMemo(() => {
    const cm = BAR_LENGTHS_CM.reduce((best, len) =>
      Math.abs(len * scale - BAR_TARGET_PX) < Math.abs(best * scale - BAR_TARGET_PX) ? len : best,
    BAR_LENGTHS_CM[0]!);
    return { cm, px: cm * scale, label: cm >= 100 ? `${cm / 100} m` : `${cm} cm` };
  }, [scale]);

  return (
    <div className="pointer-events-none absolute bottom-2 left-2 z-legend flex flex-col gap-1.5 bg-surface/85 px-2 py-1.5 text-xs text-content-muted">
      {legend.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
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
      {/* 축척 바 — 눈금 둘을 번갈아 칠한다(도면의 관용구). 배율이 바뀌면 길이가 따라간다. */}
      <div className="flex items-center gap-1.5">
        <span aria-hidden className="flex h-[7px] border border-content-muted" style={{ width: bar.px }}>
          <span className="flex-1 bg-content-muted" />
          <span className="flex-1" />
        </span>
        <span className="tabular-nums">{bar.label}</span>
      </div>
    </div>
  );
}
