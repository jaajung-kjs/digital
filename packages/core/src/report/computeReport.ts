import type { LaborRules } from '../catalog/types.js';

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
}

export function assetReportItem(
  kind: 'asset-install' | 'asset-remove' | 'asset-relocate',
  name: string,
  typeName: string,
  labor: LaborRules,
  /** 자재단가(원/대) — 종류가 들고 있는 값. */
  unitPrice: number | null = null,
): ReportItem {
  const manDays = {
    'asset-install': labor.installManDays,
    'asset-remove': labor.removeManDays,
    'asset-relocate': labor.relocateManDays,
  }[kind];

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
  category: { name: string; laborCode: string | null; installManDaysPerM: number; removeManDaysPerM: number; unitPrice?: number | null },
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

  const manDaysPerM = kind === 'cable-install' ? category.installManDaysPerM : category.removeManDaysPerM;
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
  };
}
