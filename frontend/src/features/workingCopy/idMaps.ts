import { buildTempIdMap } from '../../utils/idHelpers';

/**
 * 저장 응답의 tempId → realId 매핑 (equipment / rackModule).
 * 단계4b — 분전 회로는 Asset 으로 흡수돼 별도 distCircuit idMap 이 없다.
 */

export interface IdMaps {
  equipment: Map<string, string>;
  rackModule: Map<string, string>;
}

interface ResponseIdMaps {
  equipmentIdMap?: Record<string, string>;
  rackModuleIdMap?: Record<string, string>;
}

export function buildIdMaps(response: ResponseIdMaps): IdMaps {
  return {
    equipment: buildTempIdMap(response.equipmentIdMap ?? {}),
    rackModule: buildTempIdMap(response.rackModuleIdMap ?? {}),
  };
}

export const resolveEquipmentId = (id: string, maps: IdMaps): string =>
  maps.equipment.get(id) ?? id;

export const resolveModuleId = (id: string, maps: IdMaps): string =>
  maps.rackModule.get(id) ?? id;
