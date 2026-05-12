import { RACK_SLOT_COUNT, type ModuleSlotUpdate, type RackModule, type RackModuleCategory } from '../../../types/rackModule';

interface Sized {
  id: string;
  slotIndex: number;
  slotSpan: number;
}

export interface PlanResult {
  affected: ModuleSlotUpdate[];
  rejected: boolean;
}

const REJECT: PlanResult = { affected: [], rejected: true };

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function planMove(module: Sized, siblings: Sized[], newSlotIndex: number): PlanResult {
  if (newSlotIndex < 0 || newSlotIndex + module.slotSpan > RACK_SLOT_COUNT) return REJECT;
  const aEnd = newSlotIndex + module.slotSpan;
  for (const m of siblings) {
    if (m.id === module.id) continue;
    if (rangesOverlap(newSlotIndex, aEnd, m.slotIndex, m.slotIndex + m.slotSpan)) {
      return REJECT;
    }
  }
  return {
    affected: [{ id: module.id, slotIndex: newSlotIndex, slotSpan: module.slotSpan }],
    rejected: false,
  };
}

export function planResize(module: Sized, siblings: Sized[], newSpan: number): PlanResult {
  if (newSpan < 1 || module.slotIndex + newSpan > RACK_SLOT_COUNT) return REJECT;
  const newBottom = module.slotIndex + newSpan;
  const currentBottom = module.slotIndex + module.slotSpan;
  const updates: ModuleSlotUpdate[] = [
    { id: module.id, slotIndex: module.slotIndex, slotSpan: newSpan },
  ];
  // 줄이는 경우 — 확장 영역이 없으므로 자연히 충돌 없음
  for (const m of siblings) {
    if (m.id === module.id) continue;
    const mBottom = m.slotIndex + m.slotSpan;
    // m이 (currentBottom, newBottom) 확장 영역과 겹치는가?
    const overlapsExpansion = m.slotIndex < newBottom && mBottom > currentBottom;
    if (!overlapsExpansion) continue;
    const newMIndex = newBottom;
    const newMSpan = mBottom - newMIndex;
    if (newMSpan < 1) return REJECT;
    updates.push({ id: m.id, slotIndex: newMIndex, slotSpan: newMSpan });
  }
  return { affected: updates, rejected: false };
}

export function availableSpanAt(modules: Sized[], slotIndex: number): number {
  for (let i = slotIndex; i < RACK_SLOT_COUNT; i++) {
    if (modules.some((m) => m.slotIndex <= i && i < m.slotIndex + m.slotSpan)) {
      return i - slotIndex;
    }
  }
  return RACK_SLOT_COUNT - slotIndex;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function nextNameFor(
  modules: RackModule[],
  category: Pick<RackModuleCategory, 'id' | 'name'>,
): string {
  const pattern = new RegExp(`^${escapeRegex(category.name)}-(\\d+)$`);
  let maxN = 0;
  for (const m of modules) {
    if (m.categoryId !== category.id) continue;
    const match = m.name.match(pattern);
    if (match) maxN = Math.max(maxN, parseInt(match[1], 10));
  }
  return `${category.name}-${maxN + 1}`;
}
