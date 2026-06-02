import type { LocalCable } from '../editor/stores/editorStore';
import type { RackModule } from '../../types/rackModule';
import type { DistributionCircuit } from '../../types/distributionCircuit';
import { resolveEquipmentId, resolveModuleId, resolveCircuitId, type IdMaps } from './idMaps';

/**
 * Entity 별 tempId → realId 해석 함수. `useFloorPlanData.onSuccess` 의 inline
 * setCables/setRackModules/setDistributionCircuits 람다를 추출.
 */

export function resolveCableIds(c: LocalCable, maps: IdMaps): LocalCable {
  return {
    ...c,
    sourceEquipmentId: resolveEquipmentId(c.sourceEquipmentId, maps),
    targetEquipmentId: resolveEquipmentId(c.targetEquipmentId, maps),
    sourceModuleId: c.sourceModuleId ? resolveModuleId(c.sourceModuleId, maps) : null,
    targetModuleId: c.targetModuleId ? resolveModuleId(c.targetModuleId, maps) : null,
    sourceCircuitId: c.sourceCircuitId ? resolveCircuitId(c.sourceCircuitId, maps) : null,
    targetCircuitId: c.targetCircuitId ? resolveCircuitId(c.targetCircuitId, maps) : null,
  };
}

export function resolveRackModuleIds(m: RackModule, maps: IdMaps): RackModule {
  return {
    ...m,
    id: resolveModuleId(m.id, maps),
    rackEquipmentId: resolveEquipmentId(m.rackEquipmentId, maps),
  };
}

export function resolveCircuitIds(c: DistributionCircuit, maps: IdMaps): DistributionCircuit {
  return {
    ...c,
    id: resolveCircuitId(c.id, maps),
    distributionEquipmentId: resolveEquipmentId(c.distributionEquipmentId, maps),
  };
}
