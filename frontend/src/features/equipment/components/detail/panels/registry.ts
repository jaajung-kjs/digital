import type { ComponentType } from 'react';
import type { DetailPanelKind } from '../../../../../types/equipmentKind';
import { RackEquipmentPanel } from './RackEquipmentPanel';
import { OfdEquipmentPanel } from './OfdEquipmentPanel';
import { DistributionPanel } from './DistributionPanel';
import { GroundingPanel } from './GroundingPanel';
import { HvacPanel } from './HvacPanel';

export interface PanelProps {
  equipmentId: string;
}

const REGISTRY: Record<DetailPanelKind, ComponentType<PanelProps>> = {
  rack: RackEquipmentPanel,
  ofd: OfdEquipmentPanel,
  distribution: DistributionPanel,
  grounding: GroundingPanel,
  hvac: HvacPanel,
};

export function resolveDetailPanel(kind: DetailPanelKind): ComponentType<PanelProps> {
  return REGISTRY[kind];
}
