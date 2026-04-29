import { BaseEquipmentTabsPanel } from './BaseEquipmentTabsPanel';

interface PanelProps {
  equipmentId: string;
  floorId: string;
}

export function GroundingPanel({ equipmentId, floorId }: PanelProps) {
  return <BaseEquipmentTabsPanel equipmentId={equipmentId} floorId={floorId} />;
}
