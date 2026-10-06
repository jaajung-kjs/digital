import type { LaborRules } from '../catalog/laborSpec.js';

export type ReportKind = 'asset-install' | 'asset-remove' | 'asset-relocate' | 'cable-install' | 'cable-remove';

export interface ReportItem {
  kind: ReportKind;
  name: string;            // 자산명 or 케이블 파생 표시
  typeName: string;        // 타입명 or 케이블 그룹명
  laborCode: string | null;
  qty: number;             // 자산 1, 케이블 lengthM
  unit: '대' | 'm';
  manDays: number;         // 계산된 공량(인·일)
  /** 자재단가(원/단위). 안 적혀 있으면 null — 재료비가 0 이라는 뜻이다. */
  unitPrice: number | null;
  note?: string;           // '길이 미입력' 등
}

export interface ReportSummary {
  items: ReportItem[];
  byLaborType: { laborCode: string; totalManDays: number }[]; // laborCode null 제외, 이름순
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
 */
export function materialCostOf(item: ReportItem): number {
  if (item.kind !== 'asset-install' && item.kind !== 'cable-install') return 0;
  return item.qty * (item.unitPrice ?? 0);
}

export function assetReportItem(
  kind: 'asset-install' | 'asset-remove' | 'asset-relocate',
  name: string,
  typeName: string,
  labor: LaborRules,
  /** 자재단가(원/대) — 종류가 들고 있는 값. */
  unitPrice: number | null = null,
): ReportItem {
  /* null = 「안 적었다」 — 합칠 자식이 없으면 0 이다(설비 1식은 부르는 쪽이 이미 갈랐다). */
  const manDays = {
    'asset-install': labor.installManDays,
    'asset-remove': labor.removeManDays,
    'asset-relocate': labor.relocateManDays,
  }[kind] ?? 0;

  return {
    kind,
    name,
    typeName,
    laborCode: labor.laborCode,
    qty: 1,
    unit: '대',
    manDays,
    unitPrice,
  };
}

export function cableReportItem(
  kind: 'cable-install' | 'cable-remove',
  name: string,
  /** 케이블 **종류** — 품셈은 종류가 갖는다(그룹은 색·이름뿐). */
  category: { name: string; laborCode: string | null; installManDays: number | null; removeManDays: number | null; unitPrice?: number | null },
  lengthM: number | null,
): ReportItem {
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
      note: '길이 미입력',
    };
  }

  const manDaysPerM = (kind === 'cable-install' ? category.installManDays : category.removeManDays) ?? 0;
  const manDays = lengthM * manDaysPerM;

  return {
    kind,
    name,
    typeName: category.name,
    laborCode: category.laborCode,
    qty: lengthM,
    unit: 'm',
    manDays,
    unitPrice: category.unitPrice ?? null,
  };
}

export function computeReport(items: ReportItem[]): ReportSummary {
  const totalManDays = items.reduce((sum, item) => sum + item.manDays, 0);

  // Group by laborCode, excluding null
  const byLaborTypeMap = new Map<string, number>();
  for (const item of items) {
    if (item.laborCode !== null) {
      const current = byLaborTypeMap.get(item.laborCode) ?? 0;
      byLaborTypeMap.set(item.laborCode, current + item.manDays);
    }
  }

  // Sort by laborCode name and convert to array
  const byLaborType = Array.from(byLaborTypeMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([laborCode, totalManDays]) => ({ laborCode, totalManDays }));

  return {
    items,
    byLaborType,
    totalManDays,
    totalMaterialCost: items.reduce((sum, item) => sum + materialCostOf(item), 0),
  };
}
