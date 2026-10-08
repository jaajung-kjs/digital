import type { CoreMeasurement } from '../../model/types';

/**
 * 측정 수 칸 넷 — 손실 둘 · 거리 둘(파장 1310 · 1550). 머리는 2단이다: 「손실(dB)」·「거리(km)」가 두 칸씩 덮고 그 아래 파장
 * (`MeasureHeadRows`). 이름이 파장뿐이면 「1310」 두 열이 무엇으로 갈리는지 머리에서 읽히지 않는다.
 */
export const MEASURE_COLS = [
  { key: 'loss1310', group: 'loss', name: '1310', title: '1310 nm 손실' },
  { key: 'loss1550', group: 'loss', name: '1550', title: '1550 nm 손실' },
  { key: 'dist1310', group: 'dist', name: '1310', title: '1310 nm 거리' },
  { key: 'dist1550', group: 'dist', name: '1550', title: '1550 nm 거리' },
] as const;
/** 묶음 머리 — 단위는 이름 뒤 괄호(§1.7-g). */
export const MEASURE_GROUPS = [
  { key: 'loss', name: '손실', unit: 'dB' },
  { key: 'dist', name: '거리', unit: 'km' },
] as const;
export type MeasureKey = (typeof MEASURE_COLS)[number]['key'];
export type MeasureDraft = Record<MeasureKey, string>;
export const BLANK_DRAFT: MeasureDraft = { loss1310: '', dist1310: '', loss1550: '', dist1550: '' };

export const NOT_A_NUMBER = '숫자만 입력하세요';

/** 받는 수의 꼴 — 부호 하나 + 십진 소수만. `Number()` 는 `1e3`·`0x10`·`Infinity` 까지 수로 읽는다. */
const PLAIN_DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)$/;

/**
 * 칸 글자 → 수. 비었으면 null, 수가 아니면 NaN. **부호는 바꾸지 않는다** — 엑셀처럼 손실은 음수 그대로 받는다.
 */
function parseMeasure(raw: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  return PLAIN_DECIMAL.test(t) ? Number(t) : Number.NaN;
}

export const isBadCell = (raw: string) => Number.isNaN(parseMeasure(raw));
export const isBlankDraft = (d: MeasureDraft) => MEASURE_COLS.every((c) => d[c.key].trim() === '');
export const draftHasBad = (d: MeasureDraft) => MEASURE_COLS.some((c) => isBadCell(d[c.key]));

/** 측정일 기본값 — 오늘(`format.ts` 한 곳). */
export { today } from '../../../components/ui/format';

/** 측정일 칸 — 비었거나 날짜가 아니면 까닭. */
export function dateIssue(raw: string): string | null {
  const t = raw.trim();
  if (t === '') return '측정일을 입력하세요';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  if (!m || !d || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return '측정일은 2026-10-07 형식으로 입력하세요';
  return null;
}

/** 칸 → 측정 한 건(워킹카피 행). */
export function measurementOf(
  d: MeasureDraft,
  at: { id: string; lineId: string; coreNo: number; side: CoreMeasurement['side']; measuredOn: string; measuredBy: string },
): CoreMeasurement {
  return {
    id: at.id, lineId: at.lineId, coreNo: at.coreNo, side: at.side,
    measuredOn: at.measuredOn.trim(), measuredBy: at.measuredBy.trim() || null,
    loss1310: parseMeasure(d.loss1310), dist1310: parseMeasure(d.dist1310),
    loss1550: parseMeasure(d.loss1550), dist1550: parseMeasure(d.dist1550),
    updatedAt: '',
  };
}
