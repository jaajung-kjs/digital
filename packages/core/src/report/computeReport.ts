import type { LaborRules } from '../catalog/types.js';

export type ReportKind = 'asset-install' | 'asset-remove' | 'asset-relocate' | 'cable-install' | 'cable-remove';

export interface ReportItem {
  kind: ReportKind;
  name: string;            // 자산명 or 케이블 파생 표시
  typeName: string;        // 타입명 or 케이블 그룹명
  laborType: string | null;
  qty: number;             // 자산 1, 케이블 lengthM
  unit: '대' | 'm';
  hours: number;           // 계산된 공량
  note?: string;           // '길이 미입력' 등
}

export interface ReportSummary {
  items: ReportItem[];
  byLaborType: { laborType: string; totalHours: number }[]; // laborType null 제외, 이름순
  totalHours: number;
}

export function assetReportItem(
  kind: 'asset-install' | 'asset-remove' | 'asset-relocate',
  name: string,
  typeName: string,
  labor: LaborRules,
): ReportItem {
  let hours = 0;
  if (kind === 'asset-install') {
    hours = labor.installHours;
  } else if (kind === 'asset-remove') {
    hours = labor.removeHours;
  } else if (kind === 'asset-relocate') {
    hours = labor.relocateHours;
  }

  return {
    kind,
    name,
    typeName,
    laborType: labor.laborType,
    qty: 1,
    unit: '대',
    hours,
  };
}

export function cableReportItem(
  kind: 'cable-install' | 'cable-remove',
  name: string,
  group: { name: string; laborType: string | null; installHoursPerM: number; removeHoursPerM: number },
  lengthM: number | null,
): ReportItem {
  if (lengthM === null) {
    return {
      kind,
      name,
      typeName: group.name,
      laborType: group.laborType,
      qty: 0,
      unit: 'm',
      hours: 0,
      note: '길이 미입력',
    };
  }

  const hoursPerM = kind === 'cable-install' ? group.installHoursPerM : group.removeHoursPerM;
  const hours = lengthM * hoursPerM;

  return {
    kind,
    name,
    typeName: group.name,
    laborType: group.laborType,
    qty: lengthM,
    unit: 'm',
    hours,
  };
}

export function computeReport(items: ReportItem[]): ReportSummary {
  const totalHours = items.reduce((sum, item) => sum + item.hours, 0);

  // Group by laborType, excluding null
  const byLaborTypeMap = new Map<string, number>();
  for (const item of items) {
    if (item.laborType !== null) {
      const current = byLaborTypeMap.get(item.laborType) ?? 0;
      byLaborTypeMap.set(item.laborType, current + item.hours);
    }
  }

  // Sort by laborType name and convert to array
  const byLaborType = Array.from(byLaborTypeMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([laborType, totalHours]) => ({ laborType, totalHours }));

  return {
    items,
    byLaborType,
    totalHours,
  };
}
