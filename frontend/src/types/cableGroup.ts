export interface CableGroup {
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
  laborType: string | null;
  installHoursPerMeter: number | null;
  removeHoursPerMeter: number | null;
  relocateHoursPerMeter: number | null;
}
