/**
 * Construction report calculation - pure function.
 * Takes before/after PlanSnapshots and returns diff + BOM + labor.
 *
 * Ported from frontend/src/utils/constructionCalc.ts so the report can be
 * computed inside the same DB transaction as the save mutation. The output
 * shape is identical to ConstructionReport on the frontend — do NOT diverge
 * without updating frontend/src/types/constructionReport.ts at the same time.
 */

import { CONSTRUCTION_TEMPLATES, SURCHARGE_RULES, type AccessoryRule } from '../config/constructionTemplates.js';

// ============================================================
// Types (mirror frontend/src/types/constructionReport.ts)
// ============================================================

export interface PlanSnapshot {
  equipment: {
    id: string;
    name: string;
    materialCategoryCode?: string | null;
    materialCategoryName?: string | null;
    specification?: string | null;
    specParams?: Record<string, unknown> | null;
    positionX?: number;
    positionY?: number;
  }[];
  cables: {
    id: string;
    cableType: string;
    materialCategoryCode?: string | null;
    materialCategoryName?: string | null;
    specification?: string | null;
    totalLength?: number | null;
    sourceEquipmentId: string;
    targetEquipmentId: string;
    label?: string | null;
  }[];
}

export type DiffAction = 'install' | 'remove' | 'relocate' | 'modify';

export interface DiffItem {
  id: string;
  type: 'equipment' | 'cable';
  action: DiffAction;
  name: string;
  materialCategoryCode: string | null;
  specification?: string;
  quantity: number;
  unit: string;
  length?: number;
}

export interface BOMItem {
  materialCategoryCode: string;
  name: string;
  specification?: string;
  action?: DiffAction;
  quantity: number;
  unit: string;
  isAccessory: boolean;
  isManual: boolean;
}

export interface LaborItem {
  workName: string;
  laborType: string;
  hours: number;
}

export interface ConstructionReport {
  diff: DiffItem[];
  bom: BOMItem[];
  labor: LaborItem[];
  totalLaborHours: number;
}

export interface ReportOverrides {
  modifiedItems: { itemId: string; quantity: number }[];
  addedItems: {
    description: string;
    materialCategoryCode?: string;
    quantity: number;
    unit: string;
    laborHours?: number;
  }[];
  removedItemIds: string[];
  surcharges: string[];
}

// ============================================================
// Display name helper
// ============================================================

function resolveDisplayName(
  materialCategoryCode: string | null | undefined,
  specParams: Record<string, unknown> | null | undefined,
  fallbackName: string,
  materialCategoryName?: string | null,
  specification?: string | null,
): { displayName: string; specification: string | undefined } {
  let spec = specification ?? undefined;
  if (!spec && specParams && Object.keys(specParams).length > 0) {
    const values = Object.values(specParams).filter(v => v != null && v !== '');
    spec = values.length > 0 ? values.join(' ') : undefined;
  }
  const displayName = materialCategoryName || materialCategoryCode || fallbackName;
  return { displayName, specification: spec };
}

// ============================================================
// Diff computation
// ============================================================

const POSITION_THRESHOLD = 50; // px - significant position change for relocate

function computeEquipmentDiff(
  before: PlanSnapshot['equipment'],
  after: PlanSnapshot['equipment'],
): DiffItem[] {
  const beforeMap = new Map(before.map((e) => [e.id, e]));
  const afterMap = new Map(after.map((e) => [e.id, e]));
  const items: DiffItem[] = [];

  for (const [id, eq] of afterMap) {
    if (!beforeMap.has(id)) {
      const { displayName, specification } = resolveDisplayName(eq.materialCategoryCode, eq.specParams, eq.name, eq.materialCategoryName, eq.specification);
      items.push({
        id, type: 'equipment', action: 'install',
        name: displayName,
        materialCategoryCode: eq.materialCategoryCode ?? null,
        specification,
        quantity: 1, unit: '대',
      });
    }
  }

  for (const [id, eq] of beforeMap) {
    if (!afterMap.has(id)) {
      const { displayName, specification } = resolveDisplayName(eq.materialCategoryCode, eq.specParams, eq.name, eq.materialCategoryName, eq.specification);
      items.push({
        id, type: 'equipment', action: 'remove',
        name: displayName,
        materialCategoryCode: eq.materialCategoryCode ?? null,
        specification,
        quantity: 1, unit: '대',
      });
    }
  }

  for (const [id, afterEq] of afterMap) {
    const beforeEq = beforeMap.get(id);
    if (!beforeEq) continue;

    const dx = (afterEq.positionX ?? 0) - (beforeEq.positionX ?? 0);
    const dy = (afterEq.positionY ?? 0) - (beforeEq.positionY ?? 0);
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > POSITION_THRESHOLD) {
      const { displayName, specification } = resolveDisplayName(afterEq.materialCategoryCode, afterEq.specParams, afterEq.name, afterEq.materialCategoryName, afterEq.specification);
      items.push({
        id, type: 'equipment', action: 'relocate',
        name: displayName,
        materialCategoryCode: afterEq.materialCategoryCode ?? null,
        specification,
        quantity: 1, unit: '대',
      });
    } else {
      const changed =
        afterEq.name !== beforeEq.name ||
        afterEq.materialCategoryCode !== beforeEq.materialCategoryCode ||
        JSON.stringify(afterEq.specParams) !== JSON.stringify(beforeEq.specParams);

      if (changed) {
        const { displayName, specification } = resolveDisplayName(afterEq.materialCategoryCode, afterEq.specParams, afterEq.name, afterEq.materialCategoryName, afterEq.specification);
        items.push({
          id, type: 'equipment', action: 'modify',
          name: displayName,
          materialCategoryCode: afterEq.materialCategoryCode ?? null,
          specification,
          quantity: 1, unit: '대',
        });
      }
    }
  }

  return items;
}

function computeCableDiff(
  before: PlanSnapshot['cables'],
  after: PlanSnapshot['cables'],
): DiffItem[] {
  const beforeMap = new Map(before.map((c) => [c.id, c]));
  const afterMap = new Map(after.map((c) => [c.id, c]));
  const items: DiffItem[] = [];

  for (const [id, cable] of afterMap) {
    if (!beforeMap.has(id)) {
      const { displayName, specification } = resolveDisplayName(cable.materialCategoryCode, null, cable.label || cable.cableType, cable.materialCategoryName, cable.specification);
      items.push({
        id, type: 'cable', action: 'install',
        name: displayName,
        materialCategoryCode: cable.materialCategoryCode ?? null,
        specification,
        quantity: 1, unit: 'm',
        length: cable.totalLength ?? undefined,
      });
    }
  }

  for (const [id, cable] of beforeMap) {
    if (!afterMap.has(id)) {
      const { displayName, specification } = resolveDisplayName(cable.materialCategoryCode, null, cable.label || cable.cableType, cable.materialCategoryName, cable.specification);
      items.push({
        id, type: 'cable', action: 'remove',
        name: displayName,
        materialCategoryCode: cable.materialCategoryCode ?? null,
        specification,
        quantity: 1, unit: 'm',
        length: cable.totalLength ?? undefined,
      });
    }
  }

  for (const [id, afterCable] of afterMap) {
    const beforeCable = beforeMap.get(id);
    if (!beforeCable) continue;

    const changed =
      afterCable.cableType !== beforeCable.cableType ||
      afterCable.materialCategoryCode !== beforeCable.materialCategoryCode ||
      afterCable.totalLength !== beforeCable.totalLength ||
      afterCable.sourceEquipmentId !== beforeCable.sourceEquipmentId ||
      afterCable.targetEquipmentId !== beforeCable.targetEquipmentId;

    if (changed) {
      const { displayName, specification } = resolveDisplayName(afterCable.materialCategoryCode, null, afterCable.label || afterCable.cableType, afterCable.materialCategoryName, afterCable.specification);
      items.push({
        id, type: 'cable', action: 'modify',
        name: displayName,
        materialCategoryCode: afterCable.materialCategoryCode ?? null,
        specification,
        quantity: 1, unit: 'm',
        length: afterCable.totalLength ?? undefined,
      });
    }
  }

  return items;
}

// ============================================================
// BOM computation
// ============================================================

function computeBOM(diff: DiffItem[]): BOMItem[] {
  const bomMap = new Map<string, BOMItem>();
  const accMap = new Map<string, BOMItem>();

  for (const item of diff) {
    if (item.action === 'modify') continue;
    const code = item.materialCategoryCode;
    if (!code) continue;

    const key = `${code}:${item.action}`;
    const existing = bomMap.get(key);
    if (existing) {
      existing.quantity += item.length ?? item.quantity;
    } else {
      bomMap.set(key, {
        materialCategoryCode: code,
        name: item.name,
        specification: item.specification,
        action: item.action,
        quantity: item.length ?? item.quantity,
        unit: item.unit,
        isAccessory: false,
        isManual: false,
      });
    }

    const template = CONSTRUCTION_TEMPLATES[code];
    if (template?.accessories) {
      for (const acc of template.accessories) {
        addAccessory(accMap, acc, item);
      }
    }
  }

  return [...bomMap.values(), ...accMap.values()];
}

function addAccessory(
  accMap: Map<string, BOMItem>,
  acc: AccessoryRule,
  item: DiffItem,
) {
  let qty = 0;
  if (acc.quantityPerUnit) {
    qty += acc.quantityPerUnit * item.quantity;
  }
  if (acc.quantityPerMeter && item.length) {
    qty += acc.quantityPerMeter * item.length;
  }
  if (qty <= 0) return;

  const key = acc.materialCode;
  const existing = accMap.get(key);
  if (existing) {
    existing.quantity += qty;
  } else {
    accMap.set(key, {
      materialCategoryCode: acc.materialCode,
      name: acc.name,
      quantity: qty,
      unit: '개',
      isAccessory: true,
      isManual: false,
    });
  }
}

// ============================================================
// Labor computation
// ============================================================

function computeLabor(diff: DiffItem[]): LaborItem[] {
  const laborMap = new Map<string, LaborItem>();

  for (const item of diff) {
    if (item.action === 'modify') continue;
    const code = item.materialCategoryCode;
    if (!code) continue;

    const template = CONSTRUCTION_TEMPLATES[code];
    if (!template) continue;

    const rule =
      item.action === 'install' ? template.install
        : item.action === 'remove' ? template.remove
          : template.relocate ?? template.install;

    let hours = 0;
    if (rule.hoursPerUnit) {
      hours += rule.hoursPerUnit * item.quantity;
    }
    if (rule.hoursPerMeter && item.length) {
      hours += rule.hoursPerMeter * item.length;
    }

    if (hours <= 0) continue;

    const key = `${rule.workName}|${rule.laborType}`;
    const existing = laborMap.get(key);
    if (existing) {
      existing.hours += hours;
    } else {
      laborMap.set(key, {
        workName: rule.workName,
        laborType: rule.laborType,
        hours,
      });
    }
  }

  return [...laborMap.values()];
}

// ============================================================
// Main function
// ============================================================

const EMPTY_SNAPSHOT: PlanSnapshot = { equipment: [], cables: [] };

export function calculateConstructionReport(
  beforeSnapshot: PlanSnapshot | null,
  afterSnapshot: PlanSnapshot,
  overrides?: ReportOverrides,
): ConstructionReport {
  const before = beforeSnapshot ?? EMPTY_SNAPSHOT;

  const diff: DiffItem[] = [
    ...computeEquipmentDiff(before.equipment, afterSnapshot.equipment),
    ...computeCableDiff(before.cables, afterSnapshot.cables),
  ];

  let bom = computeBOM(diff);
  let labor = computeLabor(diff);

  if (overrides) {
    if (overrides.removedItemIds.length > 0) {
      const removed = new Set(overrides.removedItemIds);
      bom = bom.filter((b) => !removed.has(b.materialCategoryCode));
    }

    for (const mod of overrides.modifiedItems) {
      const bomItem = bom.find((b) => b.materialCategoryCode === mod.itemId);
      if (bomItem) bomItem.quantity = mod.quantity;
      const laborItem = labor.find((l) => l.workName === mod.itemId);
      if (laborItem) laborItem.hours = mod.quantity;
    }

    for (const added of overrides.addedItems) {
      bom.push({
        materialCategoryCode: added.materialCategoryCode ?? 'MANUAL',
        name: added.description,
        quantity: added.quantity,
        unit: added.unit,
        isAccessory: false,
        isManual: true,
      });
      if (added.laborHours) {
        labor.push({
          workName: added.description,
          laborType: '통신내선공',
          hours: added.laborHours,
        });
      }
    }

    if (overrides.surcharges.length > 0) {
      let multiplier = 1;
      for (const code of overrides.surcharges) {
        const rule = SURCHARGE_RULES.find((r) => r.code === code);
        if (rule) multiplier *= rule.multiplier;
      }
      for (const l of labor) {
        l.hours *= multiplier;
      }
    }
  }

  for (const b of bom) {
    b.quantity = Math.ceil(b.quantity * 100) / 100;
  }
  for (const l of labor) {
    l.hours = Math.round(l.hours * 100) / 100;
  }

  const totalLaborHours = labor.reduce((sum, l) => sum + l.hours, 0);

  return { diff, bom, labor, totalLaborHours: Math.round(totalLaborHours * 100) / 100 };
}
