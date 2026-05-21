import { BaseEquipmentTabsPanel } from './BaseEquipmentTabsPanel';

interface PanelProps {
  equipmentId: string;
}

export function HvacPanel({ equipmentId }: PanelProps) {
  return <BaseEquipmentTabsPanel equipmentId={equipmentId} />;
}
