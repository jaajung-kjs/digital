/**
 * Construction report — surcharge rules only.
 * Labor templates (CONSTRUCTION_TEMPLATES) and accessories have been removed:
 * labor is now computed from DB rules via RuleContext (Task 4).
 */

// ============================================================
// Surcharge rules
// ============================================================

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
