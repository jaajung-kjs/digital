/**
 * 설계서 금액 산출 — 물량에서 **총공사비**까지.
 *
 * 우리가 아는 것은 물량(무엇을 몇 개·몇 m)과 카탈로그(품셈·자재단가)뿐이다. 거기서 나오는
 * 것이 **직접공사비**(재료비 + 직접노무비)이고, 그 뒤는 전부 제비율표가 정한다.
 *
 * 계상 기준은 조달청 「공사비 산출 적용근거」를 그대로 따른다 — 항목마다 곱하는 **모수가
 * 다르다**는 것이 요점이다(직접노무비 / 노무비 / 재료비+노무비 / …). 한 모수로 뭉뚱그리면
 * 금액이 조용히 틀린다.
 *
 *   간접노무비   직접노무비 × 율
 *   공구손료     직접노무비 × 3%
 *   산재보험료   노무비(직접+간접) × 율
 *   고용보험료   노무비 × 율(7등급)
 *   건강·연금·퇴직공제  직접노무비 × 율
 *   노인장기요양 **건강보험료** × 율
 *   산안비       (재료비 + 직접노무비) × 율
 *   기타경비     (재료비 + 노무비) × 율 × 경비구성비
 *   일반관리비   (재료비 + 노무비 + 경비) × 율
 *   이윤         (노무비 + 경비 + 일반관리비) × 율   ← 재료비가 빠진다
 *   부가세       위 합계 × 10%
 */

/** 공사규모 구간 — 직접공사비가 정한다. 사용자에게 묻지 않는다. */
export type SizeBand = '10억미만' | '10-50억' | '50-300억' | '300-1000억' | '1000억이상';
/** 공사기간 구간 — 일(日). */
export type DurationBand = '183' | '365' | '1095' | '1096+';
/** 산업안전보건관리비 대상액 구간. */
export type SananBand = '2천만미만' | '5억미만' | '5-50억' | '50억이상';

/**
 * 구간의 **차례** — 화면이 표를 그릴 때 쓴다.
 *
 * 저장된 표에서 `Object.keys` 로 뽑으면 안 된다: Postgres `jsonb` 는 키 순서를 보존하지
 * 않아서(길이·바이트순으로 정규화) 「10-50억」이 「10억미만」보다 앞에 선다.
 */
export const SIZE_BANDS: readonly SizeBand[] = ['10억미만', '10-50억', '50-300억', '300-1000억', '1000억이상'];
export const DURATION_BANDS: readonly DurationBand[] = ['183', '365', '1095', '1096+'];
export const SANAN_BANDS: readonly SananBand[] = ['2천만미만', '5억미만', '5-50억', '50억이상'];

export function sizeBand(directCost: number): SizeBand {
  if (directCost < 1_000_000_000) return '10억미만';
  if (directCost < 5_000_000_000) return '10-50억';
  if (directCost < 30_000_000_000) return '50-300억';
  if (directCost < 100_000_000_000) return '300-1000억';
  return '1000억이상';
}

export function durationBand(days: number): DurationBand {
  if (days <= 183) return '183';
  if (days <= 365) return '365';
  if (days <= 1095) return '1095';
  return '1096+';
}

export function sananBand(target: number): SananBand {
  if (target < 20_000_000) return '2천만미만';
  if (target < 500_000_000) return '5억미만';
  if (target < 5_000_000_000) return '5-50억';
  return '50억이상';
}

/** 제비율표 — 기준정보로 올린 판을 그대로 받는다. */
export interface OverheadRates {
  byDuration: Record<'간접노무비' | '기타경비', Record<SizeBand, Record<DurationBand, number>>>;
  bySize: Record<'일반관리비' | '이윤', Record<SizeBand, number>>;
  fixed: Record<'고용보험료' | '건강보험료' | '연금보험료' | '퇴직공제부금비' | '노인장기요양보험료', number>;
  sanan: Record<SananBand, { rate: number; base: number | null }>;
}

/**
 * 제비율 파일에 없어 정책으로 고정된 값들.
 *
 * 공구손료 3% 와 산재보험료율은 표가 아니라 기준 문서가 정한다. 기타경비는 표의 율에
 * **경비 구성비**를 곱해 쓰는데(수도광열비·도서인쇄비 제외), 그 구성비도 표에 없다.
 */
export const POLICY = {
  공구손료: 0.03,
  /** 한전 3.656% / 조달청 3.626%. */
  산재보험료: { 한전: 0.03656, 조달청: 0.03626 } as const,
  /** 복리후생비 .193 + 소모품·사무용품비 .302 + 여비·교통·통신비 .178 + 세금과공과 .123 */
  기타경비_구성비: 0.796,
} as const;

/** 설계서에 서는 한 줄이 돈으로 바뀌기 위해 갖춰야 하는 것. */
export interface EstimateInput {
  /** 자재비 — 수량 × 자재단가. 단가가 없으면 0. */
  materialCost: number;
  /** 직접노무비 — 수량 × 품(인·일) × 노임단가(원/일). 노임이 없으면 0. */
  directLaborCost: number;
}

export interface EstimateParams {
  /** 공사기간(일) — 사람이 넣는 유일한 값. */
  days: number;
  /** 계약방법. 수의계약 이윤율은 표가 아니라 조달청 기준값이다. */
  contract: '경쟁' | '수의';
  /** 산재보험료 기준. */
  sanjaeBasis: '한전' | '조달청';
}

export interface EstimateLine {
  label: string;
  /** 무엇에 곱했는가 — 화면이 근거를 그대로 보여 준다. */
  basis: string;
  rate: number;
  amount: number;
}

export interface Estimate {
  sizeBand: SizeBand;
  durationBand: DurationBand;
  materialCost: number;
  directLaborCost: number;
  indirectLaborCost: number;
  laborCost: number;
  expenses: EstimateLine[];
  expenseTotal: number;
  overheadAdmin: EstimateLine;
  profit: EstimateLine;
  /** 부가세 전 합계. */
  subtotal: number;
  vat: number;
  total: number;
}

/** 원 단위로 맞춘다 — 설계서는 소수점 아래를 쓰지 않는다. */
const won = (v: number) => Math.round(v);

/**
 * 수의계약 이윤율 — 제비율 파일에 없어 조달청 기준값을 쓴다.
 * 1000억 미만 10%, 이상 9%.
 */
const suuiProfit = (band: SizeBand) => (band === '1000억이상' ? 0.09 : 0.1);

export function computeEstimate(
  input: EstimateInput,
  rates: OverheadRates,
  params: EstimateParams,
): Estimate {
  const material = won(input.materialCost);
  const direct = won(input.directLaborCost);

  /* 규모는 **직접공사비**가 정한다 — 사용자에게 묻지 않는다. */
  const size = sizeBand(material + direct);
  const dur = durationBand(params.days);

  const indirect = won(direct * rates.byDuration.간접노무비[size][dur]);
  const labor = direct + indirect;

  const health = won(direct * rates.fixed.건강보험료);
  const sananTarget = material + direct;
  const sanan = rates.sanan[sananBand(sananTarget)];

  const expenses: EstimateLine[] = [
    { label: '공구손료', basis: '직접노무비', rate: POLICY.공구손료, amount: won(direct * POLICY.공구손료) },
    {
      label: '산재보험료',
      basis: '노무비',
      rate: POLICY.산재보험료[params.sanjaeBasis],
      amount: won(labor * POLICY.산재보험료[params.sanjaeBasis]),
    },
    { label: '고용보험료', basis: '노무비', rate: rates.fixed.고용보험료, amount: won(labor * rates.fixed.고용보험료) },
    { label: '건강보험료', basis: '직접노무비', rate: rates.fixed.건강보험료, amount: health },
    { label: '연금보험료', basis: '직접노무비', rate: rates.fixed.연금보험료, amount: won(direct * rates.fixed.연금보험료) },
    {
      label: '퇴직공제부금비',
      basis: '직접노무비',
      rate: rates.fixed.퇴직공제부금비,
      amount: won(direct * rates.fixed.퇴직공제부금비),
    },
    /* 노인장기요양은 노무비가 아니라 **건강보험료**에 곱한다. */
    {
      label: '노인장기요양보험료',
      basis: '건강보험료',
      rate: rates.fixed.노인장기요양보험료,
      amount: won(health * rates.fixed.노인장기요양보험료),
    },
    { label: '산업안전보건관리비', basis: '재료비+직접노무비', rate: sanan.rate, amount: won(sananTarget * sanan.rate) },
    {
      label: '기타경비',
      basis: '재료비+노무비',
      rate: rates.byDuration.기타경비[size][dur] * POLICY.기타경비_구성비,
      amount: won((material + labor) * rates.byDuration.기타경비[size][dur] * POLICY.기타경비_구성비),
    },
  ];
  const expenseTotal = expenses.reduce((n, e) => n + e.amount, 0);

  const adminRate = rates.bySize.일반관리비[size];
  const overheadAdmin: EstimateLine = {
    label: '일반관리비',
    basis: '재료비+노무비+경비',
    rate: adminRate,
    amount: won((material + labor + expenseTotal) * adminRate),
  };

  /* 이윤의 모수에는 **재료비가 없다** — 조달청 기준이 그렇다. */
  const profitRate = params.contract === '수의' ? suuiProfit(size) : rates.bySize.이윤[size];
  const profit: EstimateLine = {
    label: '이윤',
    basis: '노무비+경비+일반관리비',
    rate: profitRate,
    amount: won((labor + expenseTotal + overheadAdmin.amount) * profitRate),
  };

  const subtotal = material + labor + expenseTotal + overheadAdmin.amount + profit.amount;
  const vat = won(subtotal * 0.1);

  return {
    sizeBand: size,
    durationBand: dur,
    materialCost: material,
    directLaborCost: direct,
    indirectLaborCost: indirect,
    laborCost: labor,
    expenses,
    expenseTotal,
    overheadAdmin,
    profit,
    subtotal,
    vat,
    total: subtotal + vat,
  };
}
