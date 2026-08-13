/**
 * 설계서 금액 산출 — **모수가 항목마다 다르다**는 것이 이 테스트가 지키는 것이다.
 *
 * 한 모수로 뭉뚱그리면 금액이 조용히 틀린다. 특히 두 곳이 함정이다:
 * 노인장기요양은 노무비가 아니라 **건강보험료**에 곱하고, 이윤의 모수에는 **재료비가 없다**.
 */
import { describe, it, expect } from 'vitest';
import { computeEstimate, sizeBand, durationBand, sananBand, POLICY, type OverheadRates } from './computeEstimate.js';

/* 2026.4.30 적용 조달청 표(전기통신소방전문)에서 실제로 읽은 값. */
const RATES: OverheadRates = {
  byDuration: {
    간접노무비: {
      '10억미만': { '183': 0.191, '365': 0.195, '1095': 0.198, '1096+': 0.21 },
      '10-50억': { '183': 0.189, '365': 0.193, '1095': 0.196, '1096+': 0.208 },
      '50-300억': { '183': 0.19, '365': 0.194, '1095': 0.197, '1096+': 0.209 },
      '300-1000억': { '183': 0.191, '365': 0.195, '1095': 0.198, '1096+': 0.21 },
      '1000억이상': { '183': 0.189, '365': 0.193, '1095': 0.196, '1096+': 0.208 },
    },
    기타경비: {
      '10억미만': { '183': 0.055, '365': 0.057, '1095': 0.061, '1096+': 0.067 },
      '10-50억': { '183': 0.058, '365': 0.059, '1095': 0.063, '1096+': 0.069 },
      '50-300억': { '183': 0.064, '365': 0.066, '1095': 0.069, '1096+': 0.076 },
      '300-1000억': { '183': 0.066, '365': 0.068, '1095': 0.072, '1096+': 0.078 },
      '1000억이상': { '183': 0.069, '365': 0.071, '1095': 0.074, '1096+': 0.081 },
    },
  },
  bySize: {
    일반관리비: { '10억미만': 0.08, '10-50억': 0.08, '50-300억': 0.065, '300-1000억': 0.05, '1000억이상': 0.045 },
    이윤: { '10억미만': 0.15, '10-50억': 0.15, '50-300억': 0.12, '300-1000억': 0.1, '1000억이상': 0.09 },
  },
  fixed: { 고용보험료: 0.0101, 건강보험료: 0.03595, 연금보험료: 0.0475, 퇴직공제부금비: 0.023, 노인장기요양보험료: 0.1314 },
  sanan: {
    '2천만미만': { rate: 0, base: null },
    '5억미만': { rate: 0.0315, base: null },
    '5-50억': { rate: 0.0253, base: 3_300_000 },
    '50억이상': { rate: 0.026, base: null },
  },
};

const PARAMS = { days: 30, contract: '경쟁' as const, sanjaeBasis: '한전' as const };

describe('구간 판정', () => {
  it('공사규모는 직접공사비가 정한다 — 사람에게 묻지 않는다', () => {
    expect(sizeBand(999_999_999)).toBe('10억미만');
    expect(sizeBand(1_000_000_000)).toBe('10-50억');
    expect(sizeBand(30_000_000_000)).toBe('300-1000억');
    expect(sizeBand(100_000_000_000)).toBe('1000억이상');
  });

  it('공사기간·산안비 대상액도 경계에서 갈린다', () => {
    expect(durationBand(183)).toBe('183');
    expect(durationBand(184)).toBe('365');
    expect(durationBand(1096)).toBe('1096+');
    expect(sananBand(19_999_999)).toBe('2천만미만');
    expect(sananBand(20_000_000)).toBe('5억미만');
    expect(sananBand(5_000_000_000)).toBe('50억이상');
  });
});

describe('computeEstimate', () => {
  const est = computeEstimate({ materialCost: 2_000_000, directLaborCost: 3_000_000 }, RATES, PARAMS);
  const line = (label: string) => est.expenses.find((e) => e.label === label)!;

  it('직접공사비로 규모 구간을 정하고 간접노무비를 얹는다', () => {
    expect(est.sizeBand).toBe('10억미만');
    expect(est.durationBand).toBe('183');
    expect(est.indirectLaborCost).toBe(Math.round(3_000_000 * 0.191));
    expect(est.laborCost).toBe(3_000_000 + est.indirectLaborCost);
  });

  it('항목마다 모수가 다르다', () => {
    expect(line('공구손료').amount).toBe(Math.round(3_000_000 * POLICY.공구손료));
    // 산재·고용은 **노무비**(직접+간접), 건강·연금·퇴직은 **직접노무비**
    expect(line('산재보험료').amount).toBe(Math.round(est.laborCost * 0.03656));
    expect(line('고용보험료').amount).toBe(Math.round(est.laborCost * 0.0101));
    expect(line('건강보험료').amount).toBe(Math.round(3_000_000 * 0.03595));
    expect(line('연금보험료').amount).toBe(Math.round(3_000_000 * 0.0475));
  });

  /* 함정 ① — 노인장기요양은 노무비가 아니라 건강보험료에 곱한다. */
  it('노인장기요양은 건강보험료에 곱한다', () => {
    const health = line('건강보험료').amount;
    expect(line('노인장기요양보험료').amount).toBe(Math.round(health * 0.1314));
    expect(line('노인장기요양보험료').basis).toBe('건강보험료');
  });

  it('산안비는 재료비+직접노무비 구간으로 갈리고, 2천만 미만은 적용 대상이 아니다', () => {
    // 이 공사는 대상액 500만원 → 적용 제외
    expect(line('산업안전보건관리비').amount).toBe(0);

    const bigger = computeEstimate({ materialCost: 20_000_000, directLaborCost: 30_000_000 }, RATES, PARAMS);
    const sanan = bigger.expenses.find((e) => e.label === '산업안전보건관리비')!;
    expect(sanan.rate).toBeCloseTo(0.0315, 6); // 5천만원 → 5억 미만 구간
    expect(sanan.amount).toBe(Math.round(50_000_000 * 0.0315));
  });

  it('기타경비는 표의 율에 경비 구성비를 곱한다', () => {
    expect(line('기타경비').rate).toBeCloseTo(0.055 * POLICY.기타경비_구성비, 6);
  });

  /* 함정 ② — 이윤의 모수에는 재료비가 없다. */
  it('이윤은 재료비를 뺀 모수에 곱한다', () => {
    expect(est.profit.basis).toBe('노무비+경비+일반관리비');
    const base = est.laborCost + est.expenseTotal + est.overheadAdmin.amount;
    expect(est.profit.amount).toBe(Math.round(base * 0.15));
    // 일반관리비는 재료비를 포함한다 — 둘의 모수가 다르다는 것이 요점이다.
    expect(est.overheadAdmin.amount).toBe(
      Math.round((est.materialCost + est.laborCost + est.expenseTotal) * 0.08),
    );
  });

  it('합계는 부가세 10% 를 얹는다', () => {
    expect(est.subtotal).toBe(
      est.materialCost + est.laborCost + est.expenseTotal + est.overheadAdmin.amount + est.profit.amount,
    );
    expect(est.vat).toBe(Math.round(est.subtotal * 0.1));
    expect(est.total).toBe(est.subtotal + est.vat);
  });

  it('수의계약 이윤율은 표가 아니라 조달청 기준값이다', () => {
    const suui = computeEstimate({ materialCost: 2_000_000, directLaborCost: 3_000_000 }, RATES, {
      ...PARAMS,
      contract: '수의',
    });
    expect(suui.profit.rate).toBe(0.1); // 1000억 미만
  });

  it('공사기간이 길면 간접노무비율이 올라간다', () => {
    const long = computeEstimate({ materialCost: 2_000_000, directLaborCost: 3_000_000 }, RATES, {
      ...PARAMS,
      days: 400,
    });
    expect(long.durationBand).toBe('1095');
    expect(long.indirectLaborCost).toBeGreaterThan(est.indirectLaborCost);
  });

  /* 물량만 있고 단가·품셈이 아직 없어도 화면은 서야 한다. */
  it('재료비·노무비가 0 이어도 무너지지 않는다', () => {
    const zero = computeEstimate({ materialCost: 0, directLaborCost: 0 }, RATES, PARAMS);
    expect(zero.total).toBe(0);
  });
});
