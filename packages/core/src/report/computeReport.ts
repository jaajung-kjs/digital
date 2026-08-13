import type { LaborRules } from '../catalog/types.js';

export type ReportKind = 'asset-install' | 'asset-remove' | 'asset-relocate' | 'cable-install' | 'cable-remove';

export interface ReportItem {
  kind: ReportKind;
  name: string;            // 자산명 or 케이블 파생 표시
  typeName: string;        // 타입명 or 케이블 그룹명
  laborCode: string | null;
  qty: number;             // 자산 1, 케이블 lengthM
  unit: '대' | 'm';
  hours: number;           // 계산된 공량
  note?: string;           // '길이 미입력' 등
}

export interface ReportSummary {
  items: ReportItem[];
  byLaborType: { laborCode: string; totalHours: number }[]; // laborCode null 제외, 이름순
  totalHours: number;
}

export function assetReportItem(
  kind: 'asset-install' | 'asset-remove' | 'asset-relocate',
  name: string,
  typeName: string,
  labor: LaborRules,
): ReportItem {
  const hours = {
    'asset-install': labor.installHours,
    'asset-remove': labor.removeHours,
    'asset-relocate': labor.relocateHours,
  }[kind];

  return {
    kind,
    name,
    typeName,
    laborCode: labor.laborCode,
    qty: 1,
    unit: '대',
    hours,
  };
}

export function cableReportItem(
  kind: 'cable-install' | 'cable-remove',
  name: string,
  /** 케이블 **종류** — 품셈은 종류가 갖는다(그룹은 색·이름뿐). */
  category: { name: string; laborCode: string | null; installHoursPerM: number; removeHoursPerM: number },
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
      hours: 0,
      note: '길이 미입력',
    };
  }

  const hoursPerM = kind === 'cable-install' ? category.installHoursPerM : category.removeHoursPerM;
  const hours = lengthM * hoursPerM;

  return {
    kind,
    name,
    typeName: category.name,
    laborCode: category.laborCode,
    qty: lengthM,
    unit: 'm',
    hours,
  };
}

export function computeReport(items: ReportItem[]): ReportSummary {
  const totalHours = items.reduce((sum, item) => sum + item.hours, 0);

  // Group by laborCode, excluding null
  const byLaborTypeMap = new Map<string, number>();
  for (const item of items) {
    if (item.laborCode !== null) {
      const current = byLaborTypeMap.get(item.laborCode) ?? 0;
      byLaborTypeMap.set(item.laborCode, current + item.hours);
    }
  }

  // Sort by laborCode name and convert to array
  const byLaborType = Array.from(byLaborTypeMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([laborCode, totalHours]) => ({ laborCode, totalHours }));

  return {
    items,
    byLaborType,
    totalHours,
  };
}
