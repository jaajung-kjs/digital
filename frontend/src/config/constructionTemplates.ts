/**
 * Frontend-side construction config — surcharge rules only.
 *
 * The heavy CONSTRUCTION_TEMPLATES (per-material labor + accessory rules)
 * lives in backend/src/config/constructionTemplates.ts since the report is
 * computed server-side. The surcharge rules stay frontend because they're
 * displayed as checkboxes in ReportView.
 */

export interface SurchargeRule {
  code: string;
  name: string;
  multiplier: number;
}

export const SURCHARGE_RULES: SurchargeRule[] = [
  { code: 'NIGHT', name: '야간작업', multiplier: 1.5 },
  { code: 'HIGH_ALTITUDE', name: '고소작업', multiplier: 1.3 },
  { code: 'NARROW_SPACE', name: '협소공간', multiplier: 1.2 },
  { code: 'HAZARDOUS', name: '위험지역', multiplier: 1.5 },
];
