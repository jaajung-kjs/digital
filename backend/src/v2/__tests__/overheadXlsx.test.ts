/**
 * 제비율 XLSX 읽기 — **조달청 원본**으로 잠근다.
 *
 * 기대값은 `~/0630 src/lookup.py`(골든 테스트로 원본과 대조된 파이썬 구현)가 같은 파일에서
 * 뽑은 값이다. 여기서 지키는 것은 「요율은 구간마다 다르다」는 사실이다 — 상수로 박으면
 * 공사 규모가 커질 때 조용히 틀린다.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOverheadXlsx, OverheadFormatError } from '../standards/overheadXlsx.js';

const bytes = readFileSync(join(__dirname, 'fixtures', 'overhead-2026.xlsx'));

describe('readOverheadXlsx', () => {
  it('파일이 밝힌 적용시기를 읽는다', async () => {
    const t = await readOverheadXlsx(bytes);
    expect(t.effective).toContain('2026');
    expect(t.kind).toBe('전기통신소방전문');
  });

  it('간접노무비·기타경비가 규모 × 기간으로 갈린다', async () => {
    const t = await readOverheadXlsx(bytes);
    expect(t.byDuration.간접노무비['10억미만']).toEqual({ '183': 0.191, '365': 0.195, '1095': 0.198, '1096+': 0.21 });
    expect(t.byDuration.간접노무비['1000억이상']['183']).toBeCloseTo(0.189, 5);
    expect(t.byDuration.기타경비['10억미만']).toEqual({ '183': 0.055, '365': 0.057, '1095': 0.061, '1096+': 0.067 });
    expect(t.byDuration.기타경비['1000억이상']['1096+']).toBeCloseTo(0.081, 5);
  });

  /* 일반관리비·이윤은 기간과 무관하고 규모만 탄다 — 규모가 커질수록 낮아진다. */
  it('일반관리비·이윤은 규모만 탄다', async () => {
    const t = await readOverheadXlsx(bytes);
    expect(t.bySize.일반관리비).toEqual({
      '10억미만': 0.08,
      '10-50억': 0.08,
      '50-300억': 0.065,
      '300-1000억': 0.05,
      '1000억이상': 0.045,
    });
    expect(t.bySize.이윤).toEqual({
      '10억미만': 0.15,
      '10-50억': 0.15,
      '50-300억': 0.12,
      '300-1000억': 0.1,
      '1000억이상': 0.09,
    });
  });

  it('4대보험·노인장기요양 고정요율을 글자 수식에서 뽑는다', async () => {
    const t = await readOverheadXlsx(bytes);
    expect(t.fixed.고용보험료).toBeCloseTo(0.0101, 6);
    expect(t.fixed.건강보험료).toBeCloseTo(0.03595, 6);
    expect(t.fixed.연금보험료).toBeCloseTo(0.0475, 6);
    expect(t.fixed.퇴직공제부금비).toBeCloseTo(0.023, 6);
    expect(t.fixed.노인장기요양보험료).toBeCloseTo(0.1314, 6);
  });

  it('산안비는 대상액 구간별 요율·기초액이고, 2천만 미만은 적용 대상이 아니다', async () => {
    const t = await readOverheadXlsx(bytes);
    expect(t.sanan['2천만미만']).toEqual({ rate: 0, base: null });
    expect(t.sanan['5억미만'].rate).toBeCloseTo(0.0315, 6);
    expect(t.sanan['5-50억'].rate).toBeCloseTo(0.0253, 6);
    expect(t.sanan['5-50억'].base).toBe(3_300_000);
    expect(t.sanan['50억이상'].rate).toBeCloseTo(0.026, 6);
  });

  it('엉뚱한 파일은 양식 오류로 거절한다', async () => {
    await expect(readOverheadXlsx(Buffer.from('그냥 글자'))).rejects.toBeInstanceOf(OverheadFormatError);
  });
});
