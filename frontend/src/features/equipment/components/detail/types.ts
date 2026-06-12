export interface EquipmentDetail {
  id: string;
  name: string;
  model?: string | null;
  manufacturer?: string | null;
  manager?: string | null;
  description?: string | null;
  installDate?: string | null;
  width2d?: number | null;
  height2d?: number | null;
  frontImageUrl?: string | null;
  rearImageUrl?: string | null;
  materialCategoryId?: string | null;
  materialCategoryCode?: string | null;
  materialCategoryName?: string | null;
  displayColor?: string | null;
  specification?: string | null;
  specParams?: Record<string, unknown> | null;
}
