import type { LaborRules } from '../catalog/laborSpec.js';
import { compareName } from '../model/order.js';

export type ReportKind =
  | 'rack-install' | 'rack-remove' | 'rack-relocate'
  | 'equipment-install' | 'equipment-remove' | 'equipment-relocate'
  | 'cable-install' | 'cable-remove';

/** 대(臺)로 세는 작업 — 랙과 설비. */
export type UnitReportKind = Exclude<ReportKind, 'cable-install' | 'cable-remove'>;

export interface ReportItem {
  kind: ReportKind;
  name: string;            // 랙·설비 이름, 케이블은 「A ↔ B」, 광선로는 선로명
  typeName: string;        // 품목 이름(랙·설비·케이블 품목)
  laborCode: string | null;
  qty: number;             // 랙·설비 1(대), 케이블·광선로 길이(m)
  unit: '대' | 'm';
  manDays: number;         // 계산된 공량(인·일). 공량 미입력이면 0 으로 센다
  /** 자재단가(원/단위). 안 적혀 있으면 null — 재료비가 0 이라는 뜻이다. */
  unitPrice: number | null;
  /**
   * 공량 미입력 — 품목에 이 작업(신설·철거·이설)의 공량이 안 적혀 있다(null). 셈은 0 으로 하되 화면이 따로 센다.
   * `0` 이 적혀 있으면(「품이 안 든다」) 미입력이 아니다.
   */
  manDaysMissing: boolean;
  note?: string;           // '길이 미입력' 등
}

export interface ReportSummary {
  items: ReportItem[];
  /** 직종별 공량 합 — laborCode null 제외, 직종 코드의 자연 순서(이름순은 이름을 아는 화면이 다시 정렬한다). */
  byLaborType: { laborCode: string; totalManDays: number }[];
  totalManDays: number;
  /** 이 변경이 사는 자재의 값 — 신설 줄만 더한 것이다(`materialCostOf`). */
  totalMaterialCost: number;
}

/**
 * 이 줄이 **사는 자재의 값** — 수량 × 자재단가.
 *
 * **신설만 산다.** 철거는 걷어내는 일이고, 이설은 있던 것을 옮기는 일이라 새로 사는 자재가
 * 없다. 그런데 금액 셈은 모든 줄에 단가를 곱하고 있었다 — 철거만 잔뜩 있는 공사에서
 * 재료비가 신설과 똑같이 잡혔고, 그 값이 일반관리비·이윤·부가세까지 밀고 올라갔다.
 * 화면에 자재비 칸이 서기 전에는 아무도 그것을 볼 수 없었다.
 *
 * 판정은 여기 한 번만 적는다 — 표의 칸과 금액의 모수가 갈리면 「합계가 안 맞는」 설계서가 된다.
 *
 * **줄마다 원 단위로 반올림한다**(길이는 소수 m 다 — 2.5 m × 2,101원 = 5,252.5원). 합계는 반올림한 줄의 합이라
 * 산출 내역 합계와 원가계산서 재료비가 같다. 반올림인지 절사인지는 기준 문서가 정한다 — 확인할 정책이다.
 */
export function materialCostOf(item: ReportItem): number {
  if (item.kind !== 'rack-install' && item.kind !== 'equipment-install' && item.kind !== 'cable-install') return 0;
  return Math.round(item.qty * (item.unitPrice ?? 0));
}

/** 노무유형 한 줄 — 그 직종 공량 합 × 노임단가. 노임이 없으면 `wage`·`cost` 가 `null`. */
export interface LaborCostRow { laborCode: string; name: string; manDays: number; wage: number | null; cost: number | null }

/**
 * 노무유형별 노무비와 직접노무비 — **원 단위 반올림은 직종 줄마다**(`materialCostOf` 와 같은 정책).
 * 직접노무비는 반올림한 줄의 합이라 표의 노무비 열을 그대로 더한 값과 같다. 노임이 없는 직종은 0 으로 센다.
 * 줄 순서는 직종 이름 자연 순서.
 */
export function laborCosts(
  byLaborType: ReportSummary['byLaborType'],
  wageOf: (laborCode: string) => number | null,
  nameOf: (laborCode: string) => string | null,
): { rows: LaborCostRow[]; directLaborCost: number } {
  const rows = byLaborType
    .map(({ laborCode, totalManDays }) => {
      const wage = wageOf(laborCode);
      return { laborCode, name: nameOf(laborCode) ?? laborCode, manDays: totalManDays, wage, cost: wage == null ? null : Math.round(totalManDays * wage) };
    })
    .sort((a, b) => compareName(a.name, b.name));
  return { rows, directLaborCost: rows.reduce((n, r) => n + (r.cost ?? 0), 0) };
}

/** 작업 종류 → 품 칸. 랙과 설비가 같은 칸을 쓴다(`LaborSpec`). */
const MAN_DAYS_OF: Record<UnitReportKind, 'installManDays' | 'removeManDays' | 'relocateManDays'> = {
  'rack-install': 'installManDays',
  'rack-remove': 'removeManDays',
  'rack-relocate': 'relocateManDays',
  'equipment-install': 'installManDays',
  'equipment-remove': 'removeManDays',
  'equipment-relocate': 'relocateManDays',
};

/** 대로 세는 줄(랙·설비) — 1대. */
export function unitReportItem(
  kind: UnitReportKind,
  name: string,
  typeName: string,
  labor: LaborRules,
  /** 자재단가(원/대) — 종류가 들고 있는 값. */
  unitPrice: number | null = null,
): ReportItem {
  /* null = 「안 적었다」 — 0 으로 세고 공량 미입력으로 알린다. */
  const spec = labor[MAN_DAYS_OF[kind]];

  return {
    kind,
    name,
    typeName,
    laborCode: labor.laborCode,
    qty: 1,
    unit: '대',
    manDays: spec ?? 0,
    unitPrice,
    manDaysMissing: spec === null,
  };
}

/** 길이로 세는 줄(케이블·광선로) — 수량은 m, 공량은 m 당 공량 × 길이. */
export function cableReportItem(
  kind: 'cable-install' | 'cable-remove',
  name: string,
  /** 케이블 **품목** — 공량·단가는 품목이 갖는다(`LaborSpec`). */
  category: { name: string; laborCode: string | null; installManDays: number | null; removeManDays: number | null; unitPrice?: number | null },
  lengthM: number | null,
): ReportItem {
  const perM = kind === 'cable-install' ? category.installManDays : category.removeManDays;
  const manDaysMissing = perM === null;
  if (lengthM === null) {
    return {
      kind,
      name,
      typeName: category.name,
      laborCode: category.laborCode,
      qty: 0,
      unit: 'm',
      manDays: 0,
      unitPrice: category.unitPrice ?? null,
      manDaysMissing,
      note: '길이 미입력',
    };
  }

  const manDays = lengthM * (perM ?? 0);

  return {
    kind,
    name,
    typeName: category.name,
    laborCode: category.laborCode,
    qty: lengthM,
    unit: 'm',
    manDays,
    unitPrice: category.unitPrice ?? null,
    manDaysMissing,
  };
}

export function computeReport(items: ReportItem[]): ReportSummary {
  const totalManDays = items.reduce((sum, item) => sum + item.manDays, 0);

  // 직종별 합 — 직종 없는 줄(null)은 뺀다
  const byLaborTypeMap = new Map<string, number>();
  for (const item of items) {
    if (item.laborCode !== null) {
      const current = byLaborTypeMap.get(item.laborCode) ?? 0;
      byLaborTypeMap.set(item.laborCode, current + item.manDays);
    }
  }

  const byLaborType = Array.from(byLaborTypeMap.entries())
    .sort((a, b) => compareName(a[0], b[0]))
    .map(([laborCode, totalManDays]) => ({ laborCode, totalManDays }));

  return {
    items,
    byLaborType,
    totalManDays,
    totalMaterialCost: items.reduce((sum, item) => sum + materialCostOf(item), 0),
  };
}
