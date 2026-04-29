import type { ComponentType } from 'react';
import type { DetailPanelKind } from '../../../../../types/material';
import { GenericEquipmentPanel } from './GenericEquipmentPanel';
import { RackEquipmentPanel } from './RackEquipmentPanel';
import { OfdEquipmentPanel } from './OfdEquipmentPanel';
import { DistributionPanel } from './DistributionPanel';
import { GroundingPanel } from './GroundingPanel';
import { HvacPanel } from './HvacPanel';

export interface PanelProps {
  equipmentId: string;
  floorId: string;
}

const REGISTRY: Record<DetailPanelKind, ComponentType<PanelProps>> = {
  rack: RackEquipmentPanel,
  ofd: OfdEquipmentPanel,
  distribution: DistributionPanel,
  grounding: GroundingPanel,
  hvac: HvacPanel,
  generic: GenericEquipmentPanel,
};

export function resolveDetailPanel(
  kind: DetailPanelKind | null | undefined,
): ComponentType<PanelProps> {
  return REGISTRY[kind ?? 'generic'] ?? GenericEquipmentPanel;
}
