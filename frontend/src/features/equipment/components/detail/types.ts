export interface EquipmentDetail {
  id: string;
  name: string;
  manager?: string | null;
  description?: string | null;
  installDate?: string | null;
  width2d?: number | null;
  height2d?: number | null;
}
