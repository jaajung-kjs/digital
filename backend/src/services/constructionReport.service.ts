/**
 * Construction report calculation - pure function.
 * Takes before/after PlanSnapshots and returns diff + BOM + labor.
 *
 * Labor and material computed from DB rules (RuleContext) — no hardcoded templates.
 * BOM no longer uses materialCategoryCode; cables key on categoryId, equipment on assetTypeId.
 */

import { SURCHARGE_RULES } from '../config/constructionTemplates.js';
import prisma from '../config/prisma.js';
import { NotFoundError } from '../utils/errors.js';

// ============================================================
// Types (mirror frontend/src/types/constructionReport.ts)
// ============================================================

export interface PlanSnapshot {
  equipment: {
    id: string;
    name: string;
    assetTypeId?: string | null;
    specParams?: Record<string, unknown> | null;
    positionX?: number;
    positionY?: number;
  }[];
  cables: {
    id: string;
    categoryId?: string | null;
    name: string;
    totalLength?: number | null;
    sourceAssetId: string;
    targetAssetId: string;
  }[];
}

export type DiffAction = 'install' | 'remove' | 'relocate' | 'modify';

export interface DiffItem {
  id: string;
  type: 'equipment' | 'cable';
  action: DiffAction;
  name: string;
  categoryId?: string | null;
  assetTypeId?: string | null;
  quantity: number;
  unit: string;
  length?: number;
}

export interface BOMItem {
  key: string;
  name: string;
  action?: DiffAction;
  quantity: number;
  unit: string;
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
    quantity: number;
    unit: string;
    laborHours?: number;
  }[];
  removedItemIds: string[];
  surcharges: string[];
}

// ============================================================
// Rule context — loaded from DB by reportPreview
// ============================================================

export interface CableRule {
  groupName: string;
  kind: string | null;
  laborType: string | null;
  installHoursPerMeter: number | null;
  removeHoursPerMeter: number | null;
  relocateHoursPerMeter: number | null;
}

export interface EquipRule {
  name: string;
  laborType: string | null;
  installHoursPerUnit: number | null;
  removeHoursPerUnit: number | null;
  relocateHoursPerUnit: number | null;
}

export interface RuleContext {
  cableRuleByCategoryId: Map<string, CableRule>;
  equipRuleByTypeId: Map<string, EquipRule>;
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
      items.push({
        id, type: 'equipment', action: 'install',
        name: eq.name,
        assetTypeId: eq.assetTypeId ?? null,
        quantity: 1, unit: '대',
      });
    }
  }

  for (const [id, eq] of beforeMap) {
    if (!afterMap.has(id)) {
      items.push({
        id, type: 'equipment', action: 'remove',
        name: eq.name,
        assetTypeId: eq.assetTypeId ?? null,
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
      items.push({
        id, type: 'equipment', action: 'relocate',
        name: afterEq.name,
        assetTypeId: afterEq.assetTypeId ?? null,
        quantity: 1, unit: '대',
      });
    } else {
      const changed =
        afterEq.name !== beforeEq.name ||
        afterEq.assetTypeId !== beforeEq.assetTypeId ||
        JSON.stringify(afterEq.specParams) !== JSON.stringify(beforeEq.specParams);

      if (changed) {
        items.push({
          id, type: 'equipment', action: 'modify',
          name: afterEq.name,
          assetTypeId: afterEq.assetTypeId ?? null,
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

  // canvas 1 unit = 1 cm, design docs use meters → convert cm→m
  const cmToM = (cm: number | null | undefined): number | undefined => (cm != null ? cm / 100 : undefined);

  for (const [id, cable] of afterMap) {
    if (!beforeMap.has(id)) {
      items.push({
        id, type: 'cable', action: 'install',
        name: cable.name,
        categoryId: cable.categoryId ?? null,
        quantity: 1, unit: 'm',
        length: cmToM(cable.totalLength),
      });
    }
  }

  for (const [id, cable] of beforeMap) {
    if (!afterMap.has(id)) {
      items.push({
        id, type: 'cable', action: 'remove',
        name: cable.name,
        categoryId: cable.categoryId ?? null,
        quantity: 1, unit: 'm',
        length: cmToM(cable.totalLength),
      });
    }
  }

  for (const [id, afterCable] of afterMap) {
    const beforeCable = beforeMap.get(id);
    if (!beforeCable) continue;

    const changed =
      afterCable.categoryId !== beforeCable.categoryId ||
      afterCable.totalLength !== beforeCable.totalLength ||
      afterCable.sourceAssetId !== beforeCable.sourceAssetId ||
      afterCable.targetAssetId !== beforeCable.targetAssetId;

    if (changed) {
      items.push({
        id, type: 'cable', action: 'modify',
        name: afterCable.name,
        categoryId: afterCable.categoryId ?? null,
        quantity: 1, unit: 'm',
        length: cmToM(afterCable.totalLength),
      });
    }
  }

  return items;
}

// ============================================================
// Labor computation (DB rule-based)
// ============================================================

function hoursFor(
  action: DiffAction,
  install: number | null,
  remove: number | null,
  relocate: number | null,
): number | null {
  if (action === 'install') return install;
  if (action === 'remove') return remove;
  if (action === 'relocate') return relocate ?? install;
  return null; // modify etc.
}

function upsertLabor(
  map: Map<string, LaborItem>,
  workName: string,
  laborType: string,
  hours: number,
) {
  if (hours <= 0) return;
  const key = `${workName}|${laborType}`;
  const ex = map.get(key);
  if (ex) ex.hours += hours;
  else map.set(key, { workName, laborType, hours });
}

function computeCableLabor(diff: DiffItem[], ctx: RuleContext): LaborItem[] {
  const map = new Map<string, LaborItem>();
  for (const it of diff) {
    if (it.type !== 'cable' || it.action === 'modify' || !it.categoryId || !it.length) continue;
    const r = ctx.cableRuleByCategoryId.get(it.categoryId);
    if (!r || !r.laborType) continue;
    const perM = hoursFor(it.action, r.installHoursPerMeter, r.removeHoursPerMeter, r.relocateHoursPerMeter);
    if (!perM) continue;
    const hours = perM * it.length;
    const actionLabel =
      it.action === 'install' ? '포설' : it.action === 'remove' ? '철거' : '이설';
    const workName = `${r.groupName} ${actionLabel}`;
    upsertLabor(map, workName, r.laborType, hours);
  }
  return [...map.values()];
}

function computeEquipmentLabor(diff: DiffItem[], ctx: RuleContext): LaborItem[] {
  const map = new Map<string, LaborItem>();
  for (const it of diff) {
    if (it.type !== 'equipment' || it.action === 'modify' || !it.assetTypeId) continue;
    const r = ctx.equipRuleByTypeId.get(it.assetTypeId);
    if (!r || !r.laborType) continue;
    const perU = hoursFor(
      it.action,
      r.installHoursPerUnit,
      r.removeHoursPerUnit,
      r.relocateHoursPerUnit,
    );
    if (!perU) continue;
    const hours = perU * it.quantity;
    const actionLabel =
      it.action === 'install' ? '설치' : it.action === 'remove' ? '철거' : '이설';
    const workName = `${r.name} ${actionLabel}`;
    upsertLabor(map, workName, r.laborType, hours);
  }
  return [...map.values()];
}

// ============================================================
// BOM computation (material only — no accessories)
// ============================================================

function computeMaterial(diff: DiffItem[]): BOMItem[] {
  const map = new Map<string, BOMItem>();
  for (const it of diff) {
    if (it.action === 'modify') continue;
    const key = `${it.type}:${it.categoryId ?? it.assetTypeId ?? it.id}:${it.action}`;
    const qty = it.length ?? it.quantity;
    const ex = map.get(key);
    if (ex) {
      ex.quantity += qty;
    } else {
      map.set(key, { key, name: it.name, action: it.action, quantity: qty, unit: it.unit, isManual: false });
    }
  }
  return [...map.values()];
}

// ============================================================
// Main function
// ============================================================

const EMPTY_SNAPSHOT: PlanSnapshot = { equipment: [], cables: [] };

export function calculateConstructionReport(
  beforeSnapshot: PlanSnapshot | null,
  afterSnapshot: PlanSnapshot,
  ctx: RuleContext,
  overrides?: ReportOverrides,
): ConstructionReport {
  const before = beforeSnapshot ?? EMPTY_SNAPSHOT;

  const diff: DiffItem[] = [
    ...computeEquipmentDiff(before.equipment, afterSnapshot.equipment),
    ...computeCableDiff(before.cables, afterSnapshot.cables),
  ];

  let bom = computeMaterial(diff);
  let labor: LaborItem[] = [
    ...computeCableLabor(diff, ctx),
    ...computeEquipmentLabor(diff, ctx),
  ];

  if (overrides) {
    if (overrides.removedItemIds && overrides.removedItemIds.length > 0) {
      const removed = new Set(overrides.removedItemIds);
      bom = bom.filter((b) => !removed.has(b.key));
    }

    if (overrides.modifiedItems) {
      for (const mod of overrides.modifiedItems) {
        const bomItem = bom.find((b) => b.key === mod.itemId);
        if (bomItem) bomItem.quantity = mod.quantity;
        const laborItem = labor.find((l) => l.workName === mod.itemId);
        if (laborItem) laborItem.hours = mod.quantity;
      }
    }

    if (overrides.addedItems) {
      for (const added of overrides.addedItems) {
        bom.push({
          key: 'MANUAL',
          name: added.description,
          quantity: added.quantity,
          unit: added.unit,
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
    }

    if (overrides.surcharges && overrides.surcharges.length > 0) {
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

// ============================================================
// Overlay preview (dry-run)
// ============================================================

export interface ReportPreviewChanges {
  before: PlanSnapshot;
  after: PlanSnapshot;
}

/**
 * 활성 층 staged 변경(오버레이)으로 설계서를 dry-run 산출한다.
 *
 * `changes` 는 엔진이 그대로 먹는 before/after PlanSnapshot 쌍(활성 층에
 * 영향받는 설비·케이블만). reportPreview 는 floor 가 해당 substation 소유인지만
 * 확인(읽기)하고 `calculateConstructionReport` 를 호출한다. **DB 저장 없음.**
 */
export async function reportPreview(
  substationId: string,
  floorId: string,
  changes: ReportPreviewChanges,
  overrides?: ReportOverrides,
): Promise<ConstructionReport> {
  // floor 소유권 검증 — 다른 변전소 floor 로 산출 요청 차단(읽기 전용).
  const floor = await prisma.floor.findFirst({
    where: { id: floorId, substationId },
    select: { id: true },
  });
  if (!floor) {
    throw new NotFoundError('해당 변전소의 층');
  }

  // RuleContext 를 DB 에서 로드한다.
  // 1) 케이블 카테고리 → group(노무 규칙) 조인
  const cableCategoryRows = await prisma.cableCategory.findMany({
    include: { group: true },
  });
  const cableRuleByCategoryId = new Map<string, CableRule>();
  for (const cat of cableCategoryRows) {
    if (cat.group) {
      cableRuleByCategoryId.set(cat.id, {
        groupName: cat.group.name,
        kind: cat.group.kind ?? null,
        laborType: cat.group.laborType ?? null,
        installHoursPerMeter: cat.group.installHoursPerMeter ?? null,
        removeHoursPerMeter: cat.group.removeHoursPerMeter ?? null,
        relocateHoursPerMeter: cat.group.relocateHoursPerMeter ?? null,
      });
    }
  }

  // 2) 설비 타입 → 노무 규칙
  const assetTypeRows = await prisma.assetType.findMany({
    select: {
      id: true, name: true,
      laborType: true,
      installHoursPerUnit: true,
      removeHoursPerUnit: true,
      relocateHoursPerUnit: true,
    },
  });
  const equipRuleByTypeId = new Map<string, EquipRule>();
  for (const at of assetTypeRows) {
    equipRuleByTypeId.set(at.id, {
      name: at.name,
      laborType: at.laborType ?? null,
      installHoursPerUnit: at.installHoursPerUnit ?? null,
      removeHoursPerUnit: at.removeHoursPerUnit ?? null,
      relocateHoursPerUnit: at.relocateHoursPerUnit ?? null,
    });
  }

  const ctx: RuleContext = { cableRuleByCategoryId, equipRuleByTypeId };

  return calculateConstructionReport(changes.before, changes.after, ctx, overrides);
}
