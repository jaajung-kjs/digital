/**
 * P8: legacy MaterialCategory removed at the model level.
 *
 *   - CABLE 분류         → `CableCategory`         (./cableCategory)
 *   - RACK 모듈 분류     → `RackModuleCategory`    (./rackModule)
 *   - RackPreset 정의   → `RackPreset`            (./rackPreset)
 *   - BOM/시공 자재      → `BomMaterial`           (./bomMaterial)
 *   - SpecTemplate / buildSpecificationString → ./specTemplate
 *
 * The types below are P8 **compatibility shims** kept just to make existing UI
 * call sites typecheck. They will be removed in P9 along with their call sites.
 *
 * ⚠️ Do NOT add new usages of the shim types — pull from the new modules listed
 * above instead.
 */

import type { CableType } from './enums';

export type {
  SpecParam,
  SpecTemplate,
} from './specTemplate';
export { buildSpecificationString } from './specTemplate';
export type { CableDisplayGroup } from './cableCategory';
export type { DetailPanelKind } from './equipmentKind';

import type { SpecTemplate } from './specTemplate';
import type { CableDisplayGroup } from './cableCategory';

// ── enum 매핑 — 기존 cable 카테고리 코드 → CableType ──
//
// CableCategory.code 기준 (P6 시드 코드와 동일).

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

// ============================================
// P8 deprecation shims (will be removed in P9)
// ============================================

/** @deprecated P8 — use CableCategory / RackModuleCategory / BomMaterial instead. */
export type MaterialCategoryType = 'CABLE' | 'EQUIPMENT' | 'ACCESSORY';

/** @deprecated P8 — replaced by EquipmentKind + RackModuleCategory.placementType is gone. */
export type PlacementType = 'rack_mounted' | 'standalone';

/** @deprecated P8 — replaced by RackPreset (frontend/src/types/rackPreset.ts). */
export interface RackPresetModule {
  slotU: number;
  heightU: number;
  materialCategoryCode: string;
  name?: string;
}

/** @deprecated P8 — replaced by RackPreset (frontend/src/types/rackPreset.ts). */
export interface RackPreset {
  totalU: number;
  modules: RackPresetModule[];
}

/**
 * @deprecated P8 — split into CableCategory / RackModuleCategory / BomMaterial.
 * Kept only so legacy UI components compile until P9 rewrites them.
 */
export interface MaterialCategory {
  id: string;
  code: string;
  name: string;
  categoryType: MaterialCategoryType;
  parentId: string | null;
  displayColor: string | null;
  iconName: string | null;
  unit: string | null;
  specTemplate: SpecTemplate | null;
  sortOrder: number;
  isActive: boolean;
  description?: string | null;
  aliases?: { id: string; aliasName: string; source: string | null }[];
  children?: MaterialCategory[];
  placementType?: PlacementType | null;
  detailPanelKind?: import('./equipmentKind').DetailPanelKind | null;
  rackPreset?: RackPreset | null;
  displayGroup?: CableDisplayGroup | null;
}

/** @deprecated P8 — Material/MaterialAlias tables dropped (P6). */
export interface Material {
  id: string;
  categoryId: string;
  code: string;
  name: string;
  specification: string;
  unit: string;
  properties: Record<string, unknown> | null;
  isActive: boolean;
  created?: boolean;
}
