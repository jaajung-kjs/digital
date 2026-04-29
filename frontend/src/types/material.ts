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
export { buildSpecificationString } from './specTemplate';
export type { CableDisplayGroup } from './cableCategory';
export type { DetailPanelKind } from './equipmentKind';

// CableCategory.code → CableType. Codes match the P6 seed.
export const MATERIAL_TO_CABLE_TYPE: Record<string, CableType> = {
  'CBL-FCV': 'AC', 'CBL-FR': 'AC', 'CBL-VCT': 'AC', 'CBL-HIV': 'AC',
  'CBL-UTP': 'LAN',
  'CBL-OPT': 'FIBER', 'CBL-OPJ': 'FIBER', 'CBL-OPT-B': 'FIBER',
  'CBL-IV': 'GROUND', 'CBL-BARE': 'GROUND',
  'CBL-CVV': 'DC', 'CBL-CPEV': 'LAN', 'CBL-PCM': 'LAN',
  'CBL-COAX': 'LAN', 'CBL-CHAMP': 'LAN', 'CBL-SIG': 'DC',
};

export function getCableTypeFromMaterial(code: string): CableType {
  return MATERIAL_TO_CABLE_TYPE[code] || 'LAN';
}
