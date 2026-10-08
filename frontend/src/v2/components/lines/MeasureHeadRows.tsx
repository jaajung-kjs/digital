import type { ReactNode } from 'react';
import { Th } from '../../../components/ui';
import { MEASURE_COLS, MEASURE_GROUPS } from './measureDraft';

/**
 * 측정 표의 **2단 머리**(§1.7-g 의 유일한 예외 — 같은 이름(파장)이 묶음마다 서는 표) — 윗줄 「손실(dB)」·「거리(km)」가
 * 두 칸씩 덮고, 아랫줄이 파장 1310 · 1550 이다. 앞뒤 칸(`lead`·`trail`)은 두 줄을 세로로 덮는다(`rowSpan`).
 */
export function MeasureHeadRows({ lead, trail }: { lead: ReactNode; trail?: ReactNode }) {
  return (
    <>
      <tr>
        {lead}
        {MEASURE_GROUPS.map((g) => (
          <Th key={g.key} colSpan={2} unit={g.unit} className="!text-center">{g.name}</Th>
        ))}
        {trail}
      </tr>
      <tr>
        {MEASURE_COLS.map((c) => <Th key={c.key} align="right" title={c.title}>{c.name}</Th>)}
      </tr>
    </>
  );
}
