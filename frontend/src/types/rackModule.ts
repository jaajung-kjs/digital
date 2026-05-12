export const RACK_SLOT_COUNT = 12 as const;

export interface RackModuleCategory {
  id: string;
  code: string;
  name: string;
  description: string | null;
  displayColor: string | null;
  defaultSlotSpan: number;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RackModule {
  id: string;
  rackEquipmentId: string;
  categoryId: string;
  categoryCode: string | null;
  categoryName: string | null;
  categoryDisplayColor: string | null;
  categoryDefaultSlotSpan: number;
  name: string;
  slotIndex: number;        // 0..11
  slotSpan: number;         // 1..12, slotIndex + slotSpan ≤ 12
  installDate: string | null;
  manager: string | null;
  description: string | null;
  properties: unknown | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ModuleSlotUpdate {
  id: string;
  slotIndex: number;
  slotSpan: number;
}
