/**
 * Construction report — UI-side helpers + type re-exports.
 *
 * Heavy computation (diff/BOM/labor) was moved to
 * backend/src/services/constructionReport.service.ts and now happens inside
 * the save transaction. This file keeps only the bits frontend code needs:
 * shared types and presentation helpers (badge color, icon, CSV export).
 */

export type {
  DiffAction,
  DiffItem,
  BOMItem,
  LaborItem,
  ConstructionReport,
  ReportOverrides,
} from '../types/constructionReport';

import type { ConstructionReport, DiffAction } from '../types/constructionReport';

// ============================================================
// Helpers
// ============================================================

export function actionLabel(action: DiffAction): string {
  switch (action) {
    case 'install': return '신설';
    case 'remove': return '철거';
    case 'relocate': return '이설';
    case 'modify': return '변경';
  }
}

export function actionBadgeColor(action: DiffAction): string {
  switch (action) {
    case 'install': return 'bg-success-bg text-success';
    case 'remove': return 'bg-danger-bg text-danger';
    case 'relocate': return 'bg-info-bg text-primary';
    case 'modify': return 'bg-warning-bg text-warning';
  }
}

// ============================================================
// CSV export (lightweight — no external dependency)
// ============================================================

export function exportReportToCSV(report: ConstructionReport): void {
  const BOM = '﻿'; // UTF-8 BOM for Excel

  // Sheet 1: BOM
  let csv = BOM;
  csv += '=== 자재 수량표 ===\n';
  csv += '키,자재명,수량,단위,비고\n';
  for (const b of report.bom) {
    csv += `${esc(b.key)},${esc(b.name)},${b.quantity},${esc(b.unit)},${b.isManual ? '수동추가' : ''}\n`;
  }

  csv += '\n=== 노무량표 ===\n';
  csv += '공종,직종,공수(인)\n';
  for (const l of report.labor) {
    csv += `${esc(l.workName)},${esc(l.laborType)},${l.hours}\n`;
  }
  csv += `총 노무,,"${report.totalLaborHours}"\n`;

  csv += '\n=== 변경 내역 ===\n';
  // CM-B: d.length 는 cm 단위 (캔버스 1 unit = 1 cm).
  csv += '구분,작업,항목명,분류ID,수량,단위,연장(cm)\n';
  for (const d of report.diff) {
    const idCol = d.categoryId ?? d.assetTypeId ?? '';
    csv += `${esc(d.type)},${actionLabel(d.action)},${esc(d.name)},${esc(idCol)},${d.quantity},${esc(d.unit)},${d.length ?? ''}\n`;
  }

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `설계서_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function esc(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}
