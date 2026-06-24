/**
 * P9: legacy `MaterialCategory` / `Material` types are gone — they were split
 * in P6 into:
 *
 *   - CableCategory       (./cableCategory)
 *   - RackModuleCategory  (./rackModule)
 *   - RackPreset          (./rackPreset)
 *   - BomMaterial         (./bomMaterial)
 *
 * What's left here is the small mapping helper that turns a CableCategory
 * code (`CBL-UTP` etc.) into a legacy `CableType` enum value used by
 * connection rendering / cable-tracer code paths. Everything else has been
 * deleted or moved to the dedicated modules above.
 */

import type { CableType } from './enums';

export type {
  SpecParam,
  SpecTemplate,
} from './specTemplate';
export type { CableDisplayGroup } from './cableCategory';
export type { DetailPanelKind } from './equipmentKind';

// displayGroup(고정 5종) → CableType. 케이블 구조타입의 단일 파생 소스.
export const GROUP_TO_CABLE_TYPE: Record<string, CableType> = {
  '광': 'FIBER', '전원': 'AC', '네트워크': 'LAN', '제어': 'DC', '접지': 'GROUND',
};

export function getCableTypeFromGroup(group: string | null | undefined): CableType {
  return (group && GROUP_TO_CABLE_TYPE[group]) || 'LAN';
}
