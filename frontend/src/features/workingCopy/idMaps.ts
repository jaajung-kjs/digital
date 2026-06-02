import { buildTempIdMap } from '../../utils/idHelpers';

/**
 * 저장 응답의 tempId → realId 매핑 3종 (equipment / rackModule / distCircuit).
 * inline 으로 6 줄 흩어져 있던 것을 한 함수로 묶었다.
 */

export interface IdMaps {
  equipment: Map<string, string>;
  rackModule: Map<string, string>;
  distCircuit: Map<string, string>;
}

interface ResponseIdMaps {
  equipmentIdMap?: Record<string, string>;
  rackModuleIdMap?: Record<string, string>;
  distCircuitIdMap?: Record<string, string>;
}

export function buildIdMaps(response: ResponseIdMaps): IdMaps {
  return {
    equipment: buildTempIdMap(response.equipmentIdMap ?? {}),
    rackModule: buildTempIdMap(response.rackModuleIdMap ?? {}),
    distCircuit: buildTempIdMap(response.distCircuitIdMap ?? {}),
  };
}

export const resolveEquipmentId = (id: string, maps: IdMaps): string =>
  maps.equipment.get(id) ?? id;

export const resolveModuleId = (id: string, maps: IdMaps): string =>
  maps.rackModule.get(id) ?? id;

export const resolveCircuitId = (id: string, maps: IdMaps): string =>
  maps.distCircuit.get(id) ?? id;
