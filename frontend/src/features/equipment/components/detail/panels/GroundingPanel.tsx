import { BaseEquipmentTabsPanel } from './BaseEquipmentTabsPanel';

interface PanelProps {
  equipmentId: string;
}

export function GroundingPanel({ equipmentId }: PanelProps) {
  return <BaseEquipmentTabsPanel equipmentId={equipmentId} />;
}
