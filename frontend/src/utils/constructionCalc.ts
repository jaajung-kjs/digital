/**
 * Construction report calculation - pure function.
 * Takes before/after snapshots and returns diff + BOM + labor.
 */

import { CONSTRUCTION_TEMPLATES, SURCHARGE_RULES } from '../config/constructionTemplates';
import type { AccessoryRule } from '../config/constructionTemplates';
/** Resolve category name + specification separately from DB data */
function resolveDisplayName(
  materialCategoryCode: string | null | undefined,
  specParams: Record<string, unknown> | null | undefined,
  fallbackName: string,
  materialCategoryName?: string | null,
  specification?: string | null,
): { displayName: string; specification: string | undefined } {
  // Use pre-built specification if available, otherwise build from specParams
  let spec = specification ?? undefined;
  if (!spec && specParams && Object.keys(specParams).length > 0) {
    const values = Object.values(specParams).filter(v => v != null && v !== '');
    spec = values.length > 0 ? values.join(' ') : undefined;
  }

  // displayName = category name only (no spec appended)
  const displayName = materialCategoryName || materialCategoryCode || fallbackName;
  return { displayName, specification: spec };
}

// ============================================================
// Types
// ============================================================

export interface PlanSnapshot {
  elements: {
    id: string;
    elementType: string;
    materialCategoryCode?: string | null;
    pathLength?: number | null;
    properties?: Record<string, unknown>;
  }[];
  equipment: {
    id: string;
    name: string;
    category: string;
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
  type: 'equipment' | 'cable' | 'element';
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

  // New installs
  for (const [id, eq] of afterMap) {
    if (!beforeMap.has(id)) {
      const { displayName, specification } = resolveDisplayName(eq.materialCategoryCode, eq.specParams, eq.name, eq.materialCategoryName, eq.specification);
      items.push({
        id,
        type: 'equipment',
        action: 'install',
        name: displayName,
        materialCategoryCode: eq.materialCategoryCode ?? null,
        specification,
        quantity: 1,
        unit: '대',
      });
    }
  }

  // Removals
  for (const [id, eq] of beforeMap) {
    if (!afterMap.has(id)) {
      const { displayName, specification } = resolveDisplayName(eq.materialCategoryCode, eq.specParams, eq.name, eq.materialCategoryName, eq.specification);
      items.push({
        id,
        type: 'equipment',
        action: 'remove',
        name: displayName,
        materialCategoryCode: eq.materialCategoryCode ?? null,
        specification,
        quantity: 1,
        unit: '대',
      });
    }
  }

  // Modifications / relocations
  for (const [id, afterEq] of afterMap) {
    const beforeEq = beforeMap.get(id);
    if (!beforeEq) continue;

    const dx = (afterEq.positionX ?? 0) - (beforeEq.positionX ?? 0);
    const dy = (afterEq.positionY ?? 0) - (beforeEq.positionY ?? 0);
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > POSITION_THRESHOLD) {
      const { displayName, specification } = resolveDisplayName(afterEq.materialCategoryCode, afterEq.specParams, afterEq.name, afterEq.materialCategoryName, afterEq.specification);
      items.push({
        id,
        type: 'equipment',
        action: 'relocate',
        name: displayName,
        materialCategoryCode: afterEq.materialCategoryCode ?? null,
        specification,
        quantity: 1,
        unit: '대',
      });
    } else {
      const changed =
        afterEq.name !== beforeEq.name ||
        afterEq.category !== beforeEq.category ||
        afterEq.materialCategoryCode !== beforeEq.materialCategoryCode ||
        JSON.stringify(afterEq.specParams) !== JSON.stringify(beforeEq.specParams);

      if (changed) {
        const { displayName, specification } = resolveDisplayName(afterEq.materialCategoryCode, afterEq.specParams, afterEq.name, afterEq.materialCategoryName, afterEq.specification);
        items.push({
          id,
          type: 'equipment',
          action: 'modify',
          name: displayName,
          materialCategoryCode: afterEq.materialCategoryCode ?? null,
          specification,
          quantity: 1,
          unit: '대',
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
        id,
        type: 'cable',
        action: 'install',
        name: displayName,
        materialCategoryCode: cable.materialCategoryCode ?? null,
        specification,
        quantity: 1,
        unit: 'm',
        length: cable.totalLength ?? undefined,
      });
    }
  }

  for (const [id, cable] of beforeMap) {
    if (!afterMap.has(id)) {
      const { displayName, specification } = resolveDisplayName(cable.materialCategoryCode, null, cable.label || cable.cableType, cable.materialCategoryName, cable.specification);
      items.push({
        id,
        type: 'cable',
        action: 'remove',
        name: displayName,
        materialCategoryCode: cable.materialCategoryCode ?? null,
        specification,
        quantity: 1,
        unit: 'm',
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
        id,
        type: 'cable',
        action: 'modify',
        name: displayName,
        materialCategoryCode: afterCable.materialCategoryCode ?? null,
        specification,
        quantity: 1,
        unit: 'm',
        length: afterCable.totalLength ?? undefined,
      });
    }
  }

  return items;
}

function computeElementDiff(
  before: PlanSnapshot['elements'],
  after: PlanSnapshot['elements'],
): DiffItem[] {
  const beforeMap = new Map(before.map((e) => [e.id, e]));
  const afterMap = new Map(after.map((e) => [e.id, e]));
  const items: DiffItem[] = [];

  // Only track elements with materialCategoryCode (conduit, tray, pullbox)
  for (const [id, el] of afterMap) {
    if (!el.materialCategoryCode) continue;
    if (!beforeMap.has(id)) {
      items.push({
        id,
        type: 'element',
        action: 'install',
        name: el.elementType,
        materialCategoryCode: el.materialCategoryCode,
        quantity: 1,
        unit: el.pathLength ? 'm' : '개',
        length: el.pathLength ?? undefined,
      });
    }
  }

  for (const [id, el] of beforeMap) {
    if (!el.materialCategoryCode) continue;
    if (!afterMap.has(id)) {
      items.push({
        id,
        type: 'element',
        action: 'remove',
        name: el.elementType,
        materialCategoryCode: el.materialCategoryCode,
        quantity: 1,
        unit: el.pathLength ? 'm' : '개',
        length: el.pathLength ?? undefined,
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
    if (item.action === 'modify') continue; // modifications don't add to BOM
    const code = item.materialCategoryCode;
    if (!code) continue;

    // Main material
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

    // Accessories
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

const EMPTY_SNAPSHOT: PlanSnapshot = { elements: [], equipment: [], cables: [] };

export function calculateConstructionReport(
  beforeSnapshot: PlanSnapshot | null,
  afterSnapshot: PlanSnapshot,
  overrides?: ReportOverrides,
): ConstructionReport {
  const before = beforeSnapshot ?? EMPTY_SNAPSHOT;

  // 1. Compute diff
  const diff: DiffItem[] = [
    ...computeEquipmentDiff(before.equipment, afterSnapshot.equipment),
    ...computeCableDiff(before.cables, afterSnapshot.cables),
    ...computeElementDiff(before.elements, afterSnapshot.elements),
  ];

  // 2. Compute BOM & labor
  let bom = computeBOM(diff);
  let labor = computeLabor(diff);

  // 3. Apply overrides
  if (overrides) {
    // Remove items
    if (overrides.removedItemIds.length > 0) {
      const removed = new Set(overrides.removedItemIds);
      bom = bom.filter((b) => !removed.has(b.materialCategoryCode));
    }

    // Modify quantities
    for (const mod of overrides.modifiedItems) {
      const bomItem = bom.find((b) => b.materialCategoryCode === mod.itemId);
      if (bomItem) bomItem.quantity = mod.quantity;

      const laborItem = labor.find((l) => l.workName === mod.itemId);
      if (laborItem) laborItem.hours = mod.quantity;
    }

    // Add manual items
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

    // Apply surcharges
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

  // Round quantities
  for (const b of bom) {
    b.quantity = Math.ceil(b.quantity * 100) / 100;
  }
  for (const l of labor) {
    l.hours = Math.round(l.hours * 100) / 100;
  }

  const totalLaborHours = labor.reduce((sum, l) => sum + l.hours, 0);

  return { diff, bom, labor, totalLaborHours: Math.round(totalLaborHours * 100) / 100 };
}

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
    case 'install': return 'bg-green-100 text-green-700';
    case 'remove': return 'bg-red-100 text-red-700';
    case 'relocate': return 'bg-blue-100 text-blue-700';
    case 'modify': return 'bg-yellow-100 text-yellow-700';
  }
}

export function actionIcon(action: DiffAction): string {
  switch (action) {
    case 'install': return '+';
    case 'remove': return '-';
    case 'relocate': return '~';
    case 'modify': return '*';
  }
}

// ============================================================
// CSV export (lightweight — no external dependency)
// ============================================================

export function exportReportToCSV(report: ConstructionReport): void {
  const BOM = '\uFEFF'; // UTF-8 BOM for Excel

  // Sheet 1: BOM
  let csv = BOM;
  csv += '=== 자재 수량표 ===\n';
  csv += '분류코드,자재명,수량,단위,비고\n';
  for (const b of report.bom) {
    csv += `${esc(b.materialCategoryCode)},${esc(b.name)},${b.quantity},${esc(b.unit)},${b.isAccessory ? '부속자재' : b.isManual ? '수동추가' : ''}\n`;
  }

  csv += '\n=== 노무량표 ===\n';
  csv += '공종,직종,공수(인)\n';
  for (const l of report.labor) {
    csv += `${esc(l.workName)},${esc(l.laborType)},${l.hours}\n`;
  }
  csv += `총 노무,,"${report.totalLaborHours}"\n`;

  csv += '\n=== 변경 내역 ===\n';
  csv += '구분,작업,항목명,자재코드,수량,단위,연장(m)\n';
  for (const d of report.diff) {
    csv += `${esc(d.type)},${actionLabel(d.action)},${esc(d.name)},${esc(d.materialCategoryCode ?? '')},${d.quantity},${esc(d.unit)},${d.length ?? ''}\n`;
  }

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `설계서_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function esc(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}
