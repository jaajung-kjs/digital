export const RACK_SLOT_COUNT = 12 as const;

export interface RackModuleCategory {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface RackModule {
  id: string;
  rackAssetId: string;
  categoryId: string;
  categoryName: string | null;
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
