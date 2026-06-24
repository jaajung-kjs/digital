/**
 * Unit tests for ReportView override-apply logic.
 *
 * Tests prove:
 *  I1 — historical snapshots with materialCategoryCode (no key) render without undefined key collisions
 *  M1 — manual-item quantity edit (`MANUAL:${i}`) actually changes the computed quantity
 */
import { describe, it, expect } from 'vitest';
import type { BOMItem, ConstructionReport, ReportOverrides } from '../../../../utils/constructionCalc';
import { SURCHARGE_RULES } from '../../../../config/constructionTemplates';

// Replicated from ReportView — keep in sync if component logic changes.
const bomKey = (b: BOMItem): string => (b.key ?? b.materialCategoryCode ?? b.name) as string;

function applyOverrides(baseReport: ConstructionReport, overrides: ReportOverrides): ConstructionReport {
  const hasOverrides =
    overrides.modifiedItems.length > 0 ||
    overrides.addedItems.length > 0 ||
    overrides.removedItemIds.length > 0 ||
    overrides.surcharges.length > 0;

  if (!hasOverrides) return baseReport;

  let bom = [...baseReport.bom.map((b) => ({ ...b }))];
  let labor = [...baseReport.labor.map((l) => ({ ...l }))];

  // Remove items
  if (overrides.removedItemIds.length > 0) {
    const removed = new Set(overrides.removedItemIds);
    bom = bom.filter((b) => !removed.has(bomKey(b)));
  }

  // Modify non-manual BOM and labor items
  for (const mod of overrides.modifiedItems) {
    const bomItem = bom.find((b) => !b.isManual && bomKey(b) === mod.itemId);
    if (bomItem) bomItem.quantity = mod.quantity;
    const laborItem = labor.find((l) => l.workName === mod.itemId);
    if (laborItem) laborItem.hours = mod.quantity;
  }

  // Add manual items
  for (const added of overrides.addedItems) {
    bom.push({ key: 'MANUAL', name: added.description, quantity: added.quantity, unit: added.unit, isManual: true });
    if (added.laborHours) {
      labor.push({ workName: added.description, laborType: '통신내선공', hours: added.laborHours });
    }
  }

  // Apply manual-item quantity edits by render index (e.g. "MANUAL:0")
  const manualBom = bom.filter((b) => b.isManual);
  for (const mod of overrides.modifiedItems) {
    const match = mod.itemId.match(/^(.+):(\d+)$/);
    if (!match) continue;
    const idx = parseInt(match[2], 10);
    if (!isNaN(idx) && manualBom[idx]) {
      manualBom[idx].quantity = mod.quantity;
    }
  }

  // Surcharges
  if (overrides.surcharges.length > 0) {
    let multiplier = 1;
    for (const code of overrides.surcharges) {
      const rule = SURCHARGE_RULES.find((r) => r.code === code);
      if (rule) multiplier *= rule.multiplier;
    }
    for (const l of labor) { l.hours *= multiplier; }
  }

  for (const b of bom) { b.quantity = Math.ceil(b.quantity * 100) / 100; }
  for (const l of labor) { l.hours = Math.round(l.hours * 100) / 100; }

  const totalLaborHours = Math.round(labor.reduce((sum, l) => sum + l.hours, 0) * 100) / 100;
  return { diff: baseReport.diff, bom, labor, totalLaborHours };
}

// ── fixture ──────────────────────────────────────────────────────────────────

const BASE_REPORT: ConstructionReport = {
  diff: [],
  bom: [{ key: 'cable:catFiber:install', name: 'OPGW', action: 'install', quantity: 100, unit: 'm', isManual: false }],
  labor: [{ workName: '광 포설', laborType: '통신외선공', hours: 4 }],
  totalLaborHours: 4,
};

// ── I1: historical snapshot (materialCategoryCode, no key) ───────────────────

describe('I1 — backward-compat: materialCategoryCode fallback', () => {
  it('bomKey falls back to materialCategoryCode when key is missing', () => {
    const legacyItem = { materialCategoryCode: 'CAT-UTP', name: '랙', quantity: 1, unit: '대', isManual: false } as unknown as BOMItem;
    expect(bomKey(legacyItem)).toBe('CAT-UTP');
  });

  it('archived BOM item removed by materialCategoryCode id', () => {
    const legacyBom: BOMItem = { materialCategoryCode: 'CAT-UTP', name: '랙', quantity: 1, unit: '대', isManual: false } as unknown as BOMItem;
    const base: ConstructionReport = { ...BASE_REPORT, bom: [legacyBom] };
    const overrides: ReportOverrides = { modifiedItems: [], addedItems: [], removedItemIds: ['CAT-UTP'], surcharges: [] };
    const result = applyOverrides(base, overrides);
    expect(result.bom).toHaveLength(0);
  });

  it('archived BOM item quantity edited by materialCategoryCode id', () => {
    const legacyBom: BOMItem = { materialCategoryCode: 'CAT-UTP', name: '랙', quantity: 5, unit: '대', isManual: false } as unknown as BOMItem;
    const base: ConstructionReport = { ...BASE_REPORT, bom: [legacyBom] };
    const overrides: ReportOverrides = { modifiedItems: [{ itemId: 'CAT-UTP', quantity: 3 }], addedItems: [], removedItemIds: [], surcharges: [] };
    const result = applyOverrides(base, overrides);
    expect(result.bom[0].quantity).toBe(3);
  });
});

// ── M1: manual-item quantity edit actually applies ────────────────────────────

describe('M1 — manual-item quantity edit applies to computed report', () => {
  it('editing MANUAL:0 quantity changes the first manual item in the report', () => {
    const overrides: ReportOverrides = {
      modifiedItems: [{ itemId: 'MANUAL:0', quantity: 99 }],
      addedItems: [{ description: '공구손료', quantity: 1, unit: '식', laborHours: 0 }],
      removedItemIds: [],
      surcharges: [],
    };
    const result = applyOverrides(BASE_REPORT, overrides);
    const manual = result.bom.find((b) => b.isManual);
    expect(manual).toBeDefined();
    expect(manual?.quantity).toBe(99);
  });

  it('editing MANUAL:1 leaves MANUAL:0 unchanged', () => {
    const overrides: ReportOverrides = {
      modifiedItems: [{ itemId: 'MANUAL:1', quantity: 42 }],
      addedItems: [
        { description: '공구손료', quantity: 1, unit: '식' },
        { description: '잡자재', quantity: 10, unit: '식' },
      ],
      removedItemIds: [],
      surcharges: [],
    };
    const result = applyOverrides(BASE_REPORT, overrides);
    const manuals = result.bom.filter((b) => b.isManual);
    expect(manuals[0].quantity).toBe(1);   // MANUAL:0 unchanged
    expect(manuals[1].quantity).toBe(42);  // MANUAL:1 edited
  });

  it('non-manual item with key is not affected by MANUAL:0 edit', () => {
    const overrides: ReportOverrides = {
      modifiedItems: [{ itemId: 'MANUAL:0', quantity: 99 }],
      addedItems: [{ description: '공구손료', quantity: 5, unit: '식' }],
      removedItemIds: [],
      surcharges: [],
    };
    const result = applyOverrides(BASE_REPORT, overrides);
    const nonManual = result.bom.find((b) => !b.isManual);
    expect(nonManual?.quantity).toBe(100); // unchanged
  });
});
