import { BaseEquipmentTabsPanel } from './BaseEquipmentTabsPanel';

interface PanelProps {
  equipmentId: string;
  floorId: string;
}

export function HvacPanel({ equipmentId, floorId }: PanelProps) {
  return <BaseEquipmentTabsPanel equipmentId={equipmentId} floorId={floorId} />;
}
